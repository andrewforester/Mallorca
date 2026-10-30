# Strategy file format, versions 1, 2 and 3

The contract between the trainer (`mallorca-trainer export`) and the browser bot. Everything is little-endian. The
reference implementation is `crates/core/src/strategy.rs`; the bot reader is written from this file.

## Layout

| Offset | Size | Field | Meaning |
| --- | --- | --- | --- |
| 0 | 4 | `magic` | ASCII `MLCS` |
| 4 | 2 | `format_version` | u16, `1`, `2` or `3`. A reader rejects any other value |
| 6 | 32 | `fingerprint` | SHA-256 over the abstraction part of the preset, the serialized tree and the bucket tables of the training run |
| 38 | 4 | `small_blind` | u32 |
| 42 | 4 | `big_blind` | u32 |
| 46 | 4 | `stack` | u32, effective stack in chips |
| 50 | 1 | `streets` | u8 bitmask of included streets: bit 0 preflop, bit 1 flop, bit 2 turn, bit 3 river. Bit 0 is always set, bits 4 to 7 are zero |
| 51 | 8 | `iterations` | u64, training iterations of the exported checkpoint |
| 59 | 4 | `checkpoint` | u32, number of the exported checkpoint |
| 63 | 4 | `tree_length` | u32, byte length of the tree that follows |
| 67 | `tree_length` | `tree` | serialized tree, see below |
| next | 4 | `buckets_length` | u32, byte length of the bucket section that follows |
| next | `buckets_length` | `buckets` | bucket tables, see below |
| next | rest of file | `probabilities` | one byte per action per infoset, see below |

The probabilities section has no length field: it runs to the end of the file. Its length must equal the value
computed in "Probabilities"; a reader treats any other length as a corrupt file.

## Tree

The same bytes as the trainer's tree serialization. All integers are little-endian.

```
buckets      4 x u16   bucket count per street: preflop (169), flop, turn, river
node_count   u32
nodes        node_count entries, node id = index, root = 0
```

A node starts with a one-byte tag.

- Tag 0, decision: `seat u8`, `street u8` (0 preflop .. 3 river), `committed 2 x u32`, `street_bets 2 x u32`,
  `action_count u8` (at least 1), then `action_count` actions. An action is a kind byte, an optional `u32`, and the
  child node id `u32`. Kind 0 fold, 1 check, 2 call, 3 raise to (followed by the raise-to amount as `u32`
  chips), 4 all-in. The `u32` of a raise comes before the child id. A child id is always greater than the id of
  its parent.
- Tag 1, fold terminal: `folder u8`, `committed 2 x u32`.
- Tag 2, showdown terminal: `committed 2 x u32`.

## Buckets

The section holds one table for each included postflop street, in street order (flop, turn, river). A file with
`streets = 0b0011` therefore holds the flop table only.

```
for each included postflop street:
    length   u32
    table    length bytes
```

The table of a street maps the canonical hand class index of the hole cards plus board to a bucket number, one byte
per class. Expected lengths: flop 1286792, turn 13960050, river 123156254. The sections' `buckets_length` equals the
sum of `4 + length` over the tables. Preflop has no table: the bucket is the preflop class index, 0 to 168. The tables are
the trainer's `.bkt` files without their 9 byte header.

## Buckets in version 2

Version 2 is the play file (`export --streets play`): all four streets, the flop table and percentile thresholds for
the turn and river, so the browser never loads the 14 MB and 123 MB tables. Everything else is as in version 1. Each
included postflop street, in street order, starts with a kind byte:

```
kind 0, table:       length u32, table length bytes
kind 1, thresholds:  count u16, count x f32
```

`count` is the street's bucket count minus one; the thresholds are finite and non-decreasing. The bucket of a hand is
the number of thresholds less than or equal to its value: on the river the hand strength against the 990 live
opponent holes (wins plus half the ties, divided by 990, in `f32`), on the turn the mean of the squared river
strength over the 46 river cards, summed in card order on the canonical representative of the turn class
(`mallorca-core::strength`). Both are bit-identical to the values the bucket tables were built from, and `export`
checks on every class that the thresholds reproduce the tables before it writes the file. The flop always uses a
table. A file that holds no thresholds is written as version 1.

## Buckets in version 3

Version 3 is the potential-aware play file: the turn and river buckets are the nearest of a set of centroids to a
feature the bot computes live, so the browser loads neither the turn nor the river table. Everything else is as in
version 2: each included postflop street, in street order, starts with a kind byte, and kinds 0 and 1 keep their
meaning. Version 3 adds kind 2:

```
kind 2, centroids:   count u16, dimension u16, count x dimension f32
                     on the river only, followed by clusters 169 bytes
```

- `count` equals the street's bucket count from the tree; centroid `i` is bucket `i`, its `dimension` values stored
  one after another.
- `dimension` is 50 on the turn and 8 on the river. Kind 2 is allowed on the turn and the river only.
- Every value is finite.
- `clusters` follows the river centroid section and appears exactly once in the file, only when the river uses
  kind 2. It maps each of the 169 preflop classes (the preflop class index of the opponent's hole cards) to an
  opponent cluster; every byte is below 8.

The bucket of a hand on a kind 2 street:

- Turn: for each of the 46 live river cards, in card order, the river hand strength of the hole cards on the five
  card board (the version 2 river strength: wins plus half the ties against the 990 live opponent holes, divided by
  990, in `f32`) falls into bin `min(floor(hs * 50), 49)`. The feature is the 50 bin counts divided by 46, in `f32`.
  The bucket is the centroid with the smallest earth mover's distance to it: running sums `a` and `b` over the bins
  in order, distance the sum of `|a - b|`, in `f32`.
- River: the feature is the opponent cluster hand strength. For each cluster `k` in 0 to 7, over the live opponent
  holes whose preflop class maps to `k`, the wins plus half the ties of the hole cards against them, divided by
  their number, in `f32`; a cluster with no live hole gives 0.5. The bucket is the centroid with the smallest
  squared Euclidean distance to it, in `f32`.
- Ties between centroids go to the lower bucket. The reference implementation is `mallorca-core::potential`
  (`turn_counts`, `histogram`, `ochs_live`, `nearest`).

A file is written as version 3 if and only if it holds a centroid section; a file without one is written exactly as
in version 1 or 2.

`export --streets play` writes version 3 for a preset with `bucketing = "potential"`: the flop table, the turn and
river centroids and the cluster map from `centroids.bin`. Before it writes the file it recomputes the bucket of every
turn class (from `river_hs.f32`) and every river class (from the OCHS board pass) with these centroids and refuses
the export, naming the street and the class, at the first class that differs from `turn.bkt` or `river.bkt`. An
`hs2` preset still gets version 2.

## Probabilities

Walk the tree nodes in id order. For every decision node whose street is included in `streets`, write one block for
each bucket `0 .. buckets[street]`, in increasing bucket order. A block is `action_count` bytes, one per action in
the node's action order. Decision nodes of excluded streets contribute nothing.

- The bytes of a block sum to exactly 255. A byte is the action's probability times 255, rounded by largest
  remainder (ties go to the lower action index). An infoset that training never reached holds the uniform
  distribution rounded the same way.
- Block start for a node and bucket `b`: the sum, over earlier included decision nodes, of `buckets[street] *
  action_count`, plus `b * action_count`.
- Total length: the sum over included decision nodes of `buckets[street] * action_count`.

## Validity

A reader rejects the file when: the magic differs, the version is not 1, 2 or 3, a version 2 bucket kind is not 0 or
1, a version 3 bucket kind is not 0, 1 or 2, a version 3 file holds no centroid section, a thresholds block has the
wrong count or a value that is not finite or smaller than the one before, a centroid section sits on the flop, has a
count other than the street's bucket count, a dimension other than 50 on the turn or 8 on the river, or a value that
is not finite, the river cluster map is short or holds a byte of 8 or more, the data ends inside the header, tree or
bucket section, `streets` lacks bit 0 or sets a bit above bit 3, the tree does not deserialize, a table has the
wrong length or the bucket section has leftover bytes, or the probabilities length differs from the total above.
