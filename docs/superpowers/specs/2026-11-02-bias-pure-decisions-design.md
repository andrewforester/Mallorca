# Play bias that moves the blueprint's pure decisions (issue #80)

The play bias multiplies the blueprint's action probabilities, so a decision the blueprint plays purely cannot move.
Looseness, stickiness and sizing hit those pure decisions and barely change play. The goal: the extreme values of
every axis visibly change how the bot plays, while a neutral bias plays the blueprint exactly.

## Success

Measured in the arena with `--stats`, bot A against `cfr`:

| Axis at its edge     | Statistic                        | Bar                               |
| -------------------- | -------------------------------- | --------------------------------- |
| `tightness=0.67`     | `vpip`                           | at least 5 points above `cfr`     |
| `stickiness=1.5`     | `foldToBet`                      | at least 5 points below `cfr`     |
| `sizing=1.5`         | `betSize`                        | at least 1.3 times that of `cfr`  |
| aggression and bluff | `betFrequency`, `raiseFrequency` | unchanged mechanism, re-measured  |

A neutral bias plays exactly the blueprint: golden and arena reference runs unchanged. The cost of each edge against
`cfr` and the gain of `tilt-exploiter` are recorded in `web/tools/arena/README.md`.

## Strength order of the buckets

Each street of a model gets, once in `Model::new`, the buckets sorted by strength and a percentile per bucket: the
middle of its mass in that order, in [0, 1].

- Preflop: the bucket is the index of one of 169 canonical classes. A constant table in `mallorca-core` holds the
  equity of each class against a random hand; a slow ignored test recomputes it and compares. The mass of a class is
  its number of combos (`class_weight`).
- After the flop the buckets are already ordered by strength: `v1` tables are strength percentiles, `v2` k-means
  clusters are sorted by mean equity in the trainer (`sort_by_equity`) and `v2` river thresholds are ordered. Each
  bucket has the same mass, so the percentile is `(b + 0.5) / N`.

## Shift in strength

Looseness and stickiness play a hand as if it were a little stronger (or weaker). For the bot's bucket `b` the target
percentile is `q = clamp(percentile(b) + δ, 0, 1)`. The two buckets next to `q` in strength order, `lo` and `hi`, give
the row `(1 − t) · p(lo) + t · p(hi)` at the same node, `t` the position of `q` between their percentiles. A hand at
the boundary of a range takes part of its stronger neighbour's continue, with that neighbour's mix of calls and raises;
junk far from the boundary stays a fold, since its neighbours fold too. At `δ = 0` the row is the bot's own.

- `tightness` acts before the flop at nodes with a fold: `δ = c_loose · ln(1 / tightness)`.
- `stickiness` acts after the flop at nodes with a fold: `δ = c_sticky · ln(stickiness)`.
- At nodes without a fold neither acts: there the shift would make the bot raise more, which is aggression.
- The former factor on fold for these two axes is removed, so each axis means one thing.
- `c_loose` and `c_sticky` are set from a first arena measurement to meet the bars above.

`biased` does the shift and then the existing factors of aggression and bluff, so the decision, the coach's view
(`explain`) and the bot's own range (`range.rs`) all see the same probabilities. The spot carries its node id to read
the neighbour rows.

## Sizing scales the bet

`sizing` no longer moves weight between the raise sizes of a node. `to_real` turns the sampled tree raise into a pot
fraction `f`; the bot bets `f · sizing` of the real pot, clamped to the legal range by `scaled_raise` (near the stack a
big bet becomes an all-in). The tree child stays the sampled one, as it does after any off-tree size. All-in stays
all-in. The weight shift between sizes (`resize`, `size_position`, `raise_ratios`) is removed.

## Unchanged

The `bot_bias` ABI, the meaning of aggression and bluff, the neutral path (`choose` samples the blueprint directly).
Bots built on a non-neutral tightness, such as `cfr-tilted`, now also play looser; their arena figures are re-measured.

## Tests

- Order: preflop percentiles are monotone in equity and weighted by combos (AA at the top, 72o near the bottom);
  postflop percentiles are `(b + 0.5) / N`.
- Shift: `δ = 0` returns the own row; a pure fold row next to a continuing stronger row gains continue at a loose
  `δ` and keeps zero at a far bucket; a negative `δ` mixes with the weaker row; `q` clamps at both ends.
- Axes: tightness shifts only preflop nodes with a fold, stickiness only postflop ones.
- Sizing: a biased bot's raise is `sizing` times the neutral one when inside the legal range, clamped otherwise.
- Neutral: existing equality tests of the neutral bot stay as they are.
