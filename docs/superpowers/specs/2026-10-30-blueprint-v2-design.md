# Blueprint v2: finer buckets, potential-aware buckets, new bet sizes

Issue #12, steps 1 and 2, plus the preflop sizes from the "Inputs from #16 and #17" section and new postflop sizes.
This spec covers the code. Training runs, measurements and the switch of the browser to the new file come after the
code and are decided then.

## Goal

The `v1` blueprint is limited by its abstraction: LBR stays at about +1001 ± 34 mbb/hand after the first hour of
training. v2 changes three levers at once in code, each switchable by preset so runs can still isolate one lever:

1. 256 buckets per street instead of 128.
2. Potential-aware buckets: distribution-aware on flop and turn, opponent cluster hand strength (OCHS) on the river.
3. A new size grid: three preflop opens, two iso sizes, two 3-bet sizes; postflop bets from a quarter pot, and a
   minimum raise next to the pot raise.

Success of the code: every lever is in a preset, `v1` builds byte for byte as before, a `tiny` potential-aware
preset runs through buckets, train, play export and the WASM bot, and the strategy file stays small enough for a
phone (flop table plus centroids; turn and river computed live).

## Decisions taken with the owner (2026-10-30)

- Preflop opens 2, 3 and 4 bb (2.5 bb is dropped); iso over a limp 3 and 4.5 bb; 3-bet ×3 and ×4 of the open; 4-bet
  ×2.2; 5-bet all-in only.
- Postflop first bets 0.25, 0.66, 1, 1.5, 2 pot; raises: the minimum raise and 1 pot.
- Potential-aware buckets by approach A: equity histograms with one-dimensional EMD on flop and turn, OCHS with L2 on
  the river. Hierarchical potential-aware buckets (approach B) are a later lever.
- PR #20 is merged and is the base. PR #18 (subgame solver) stays open; it is rebased on v2 and re-measured after v2
  is trained.

## 1. Preset and tree

Preset (`mallorca-core::preset`):

- `preflop.open_bb`, `preflop.iso_vs_limp_bb`, `preflop.three_bet_x`, `preflop.four_bet_x` become lists of `f64`.
  A list has at least one value; each value is finite and greater than 1. A scalar in TOML is still accepted and
  means a list of one, and a list of one serializes as a scalar, so `abstraction_toml()` of `v1` is unchanged.
- `postflop.min_raise: bool`, default `false`, not serialized when `false`. When `true`, every postflop node where
  `first_raise_pot` applies also gets the minimum legal raise.
- `bucketing: "hs2" | "potential"`, default `"hs2"`, not serialized when `"hs2"`.
- The fingerprint of `v1` therefore stays the same: its abstraction TOML, tree bytes and tables are unchanged. A test
  pins the `v1` abstraction TOML text and the SHA-256 of the `v1` tree serialization, taken before the change.

Tree (`mallorca-core::tree`):

- `raise_targets` returns every value of the list for the preflop level, so a level yields one `RaiseTo` per size.
- With `min_raise`, the postflop raise level adds the target `min_to`. Rounding, the `all_in_threshold` limit,
  deduplication and the trailing `AllIn` stay as they are.
- New preset `presets/v2.toml`: `buckets = [256, 256, 256]`, `bucketing = "potential"`, the sizes above, the rest as
  `v1`. A preset `presets/tiny-potential.toml` is `tiny` with `bucketing = "potential"`, for tests.

Sizes measured with `trainer tree` before the preflop change: `v1` 5.3M action slots (0.06 GB); 256 buckets with the
new postflop sizes 36.4M (0.44 GB). The preflop grid multiplies the flop subtrees again; `v2` is expected near
100M slots, about 1.2 GB, well inside the 12 GB limit. The plan records the exact figure.

Bot: translation and the bot's own raises are already generic over the `RaiseTo` children of a node, preflop
included. Tests prove it on a tree with three opens: a 5 bb open maps to the 4 bb child in most draws, never to the
all-in more often than the pseudo-harmonic mapping gives, and a 2.5 bb open splits between 2 and 3 bb.

## 2. Potential-aware buckets

All feature and distance code is in `mallorca-core` (pure, builds for wasm32), so the trainer and the browser compute
the same values. Threads, files and k-means over millions of points are in `mallorca-trainer`.

Features, per hand class (hole cards plus board, canonical index of `HandIndexer`):

- River: OCHS. The 169 preflop classes are grouped into 8 opponent clusters. The feature is an 8-vector: for each
  cluster, the hand's strength against the live opponent holes of that cluster (wins plus half the ties over their
  count; a cluster with no live hole gets 0.5). Distance L2.
- Turn: a histogram of the river strength `river_hs` over the 46 river cards, 50 equal bins on [0, 1]. Distance: EMD
  in one dimension, the L1 distance between the cumulative sums.
- Flop: the same histogram over the 1081 turn and river runouts, from the river strength table.
- Opponent clusters: each preflop class gets the histogram of its river strength over all boards; k-means with EMD
  into 8 clusters. The result is a map of 169 bytes.
- Histograms are counts (integers), so the batch path (lookups in `river_hs.f32`) and the live path (`river_hs`
  computed in place) give identical features; this is the same bit identity the v2 play file relies on today.

K-means (`mallorca-trainer`):

- Weighted k-means++ seeding with a fixed seed, then Lloyd iterations until no point changes bucket or 100
  iterations. Weight of a class: the number of raw hands it stands for (suit permutations of the canonical
  representative), a new helper next to `HandIndexer`.
- Trained on a deterministic sample (at most 5M classes per street, all flop classes), then every class is assigned
  to its nearest centroid with the same core function the browser uses. Ties go to the lower bucket.
- Buckets are numbered by ascending mean equity of the centroid, so bucket order keeps a meaning across runs.
- Output in the data directory: `flop.bkt`, `turn.bkt`, `river.bkt` (unchanged format), `river_hs.f32`, and
  `centroids.bin`: magic `MLCC`, version, the 169-byte cluster map, then turn and river centroids as count, dimension
  and `f32` values. The `hs2` path is unchanged.

## 3. Strategy file and browser

- Format version 3 = version 2 plus a bucket kind 2, centroids: `count u16`, `dimension u16`, `count × dimension f32`.
  A river centroid section is followed by the 169-byte opponent cluster map. `to_bytes` writes version 3 only when
  a centroid section is present, so `v1` exports stay version 1 or 2.
- `BucketSource::Centroids { centroids, dimension, clusters }`. `Abstraction::bucket` computes the live feature of
  the street and returns the nearest centroid. Turn and river may use centroids; the flop is always a table.
- `export --streets play` with a potential preset writes the flop table and the turn and river centroids. Before
  writing, it recomputes every turn and river class from `river_hs.f32` and the board pass and checks the nearest
  centroid equals the table, as it does for thresholds today.
- `STRATEGY_FORMAT.md` documents version 3. The WASM ABI does not change; `load` accepts version 3 through
  `StrategyFile::from_bytes`. The web keeps `v1.mlcs.gz` until a trained v2 file exists.
- Live cost in the browser: river 990 opponent evaluations and 8 cluster sums; turn 46 river strengths (about 45k
  evaluations) and 256 EMD distances of 50 bins. The time of one turn bucket in release WASM under Node is measured
  once and recorded in the PR; the target is under 20 ms.

## Testing (test first, every task)

- EMD on known pairs; L2 and nearest centroid with ties.
- Class weights sum to the raw hand count of each street.
- K-means: deterministic for a seed; recovers separated clusters; ordering by mean equity.
- Features: a flush draw and a weak made hand with close mean equity have different turn histograms and land in
  different potential buckets of the `tiny-potential` run, while `hs2` puts them together.
- Batch and live features are equal on sampled classes of every street.
- `v1` abstraction TOML and tree bytes are pinned; new tree tests for three opens, iso, 3-bet ladders and the minimum
  raise; `every_action_is_legal` on `v2`.
- Strategy format 3 round trip, wrong counts and dimensions rejected, version 1 and 2 files still read.
- Bot preflop translation on a three-open tree.
- End to end, `#[ignore]`: `tiny-potential` through `buckets`, `tree`, `train`, `export --streets play`, `lbr`, and a
  hand through the WASM ABI.

## Out of scope

Training runs and `RESULTS.md` rows, the browser switch to the v2 file, LBR-guided sizes (step 3), speed (step 4),
deeper stacks (step 5), the factored tree, the cloud, and PR #18.
