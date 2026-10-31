# Blueprint v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Presets, tree, bucket pipeline, strategy format and bot support for the v2 blueprint: 256 buckets,
potential-aware buckets (equity histograms with EMD on flop and turn, OCHS on the river) and the new size grid.

**Architecture:** Features and distances live in `mallorca-core` (pure, wasm32) so trainer and browser compute
identical buckets; k-means and the bulk passes live in `mallorca-trainer`. CFR still sees only `u8` bucket tables;
the play file carries the flop table plus turn and river centroids, and the bot computes turn and river buckets live.

**Tech Stack:** Rust 1.99.1 (pinned), serde + toml, sha2, clap; WASM `extern "C"` ABI.

**Spec:** `docs/superpowers/specs/2026-10-30-blueprint-v2-design.md`

## Global Constraints

- Work from `solver/`. Before every commit: `cargo fmt --all`, `cargo clippy --all-targets -- -D warnings`,
  `cargo test`, `cargo build -p mallorca-core --target wasm32-unknown-unknown`,
  `cargo build --release -p mallorca-wasm --target wasm32-unknown-unknown`. Cargo is at `~/.cargo/bin` (add to PATH).
- TDD: the failing test first. Never loosen a tolerance, add `#[allow]`, delete an assertion.
- No comments in code or config, in any language.
- `mallorca-core` is pure: no `std::time`, `std::fs`, `std::env`, no global RNG; randomness via `&mut Rng`.
- Slow tests are `#[ignore]`; CI runs them with `cargo test --release -- --include-ignored`, so an ignored test must
  still finish in minutes on CI.
- Commits: conventional, scope `solver` (`feat(solver): ...`), one per task at least; run `git branch --show-current`
  first; branch is `feat/blueprint-v2`. End each message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Unit tests inline in `#[cfg(test)] mod tests`, as in the surrounding modules.
- Sizes: preflop opens `[2.0, 3.0, 4.0]` bb, iso `[3.0, 4.5]` bb, 3-bet `[3.0, 4.0]`×, 4-bet `[2.2]`×; postflop
  `first_bet_pot = [0.25, 0.66, 1.0, 1.5, 2.0]`, `first_raise_pot = [1.0]`, `min_raise = true`.
- Potential constants: 50 histogram bins on [0, 1], 8 OCHS clusters, k-means at most 100 Lloyd iterations, sample at
  most 5,000,000 classes per street, seed fixed in code.

## Review Focus

- A river class whose hole and board cards block every hole of an OCHS cluster: that coordinate is 0.5, no NaN
  (Task 4 test `ochs_empty_cluster_is_half`).
- K-means with fewer distinct points than k, or a cluster emptied during Lloyd: deterministic reseed, every label
  `< k`, no panic (Task 6 test `fewer_points_than_clusters`).
- Existing strategy files: the shipped `web/src/cfr/v1.mlcs.gz` (version 2) and version 1 files still load after the
  format change (Task 8 test `shipped_v1_play_file_still_loads`).
- An opponent preflop raise far above the largest open (10 bb) or between opens (2.5 bb) is translated to a tree child
  and never makes the bot act illegally (Task 3 tests).
- Batch and live features must agree bit for bit, including river HS ties, or the browser plays other buckets than
  training (Task 5 test `batch_and_live_features_agree`, Task 9 export verification).

---

### Task 1: Preset lists, `min_raise`, `bucketing`, and v1 pins

**Files:**
- Modify: `solver/crates/core/src/preset.rs`
- Modify: `solver/crates/core/src/tree.rs` (only to compile against the list types; behaviour unchanged)

**Interfaces:**
- Produces:
  - `PreflopSizes { open_bb: Sizes, iso_vs_limp_bb: Sizes, three_bet_x: Sizes, four_bet_x: Sizes }` where
    `pub struct Sizes(pub Vec<f64>)` deserializes from a TOML number or array and serializes a one-element list as a
    number, otherwise as an array. `Sizes::values(&self) -> &[f64]`.
  - `PostflopSizes.min_raise: bool` with `#[serde(default, skip_serializing_if = "is_false")]`.
  - `pub enum Bucketing { Hs2, Potential }` (`#[serde(rename_all = "lowercase")]`, default `Hs2`), field
    `Preset.bucketing` with `#[serde(default, skip_serializing_if = "Bucketing::is_hs2")]`. It is part of
    `AbstractionIdentity` (so it changes the fingerprint when set, and not when default).

- [ ] **Step 1: Pin v1 before changing anything.** In `fingerprint.rs` tests (or `preset.rs`), add
  `v1_abstraction_toml_is_pinned`: assert `Preset::from_toml(include_str!("../../../presets/v1.toml")).abstraction_toml()`
  equals the exact current text (copy it from a run of the current code). In `tree.rs` tests add
  `v1_tree_bytes_are_pinned`: SHA-256 hex of `Tree::build(&v1).serialize()` equals the value printed by the current
  code. Run both, they pass on the unchanged code. Commit (`test(solver): pin the v1 abstraction and tree`).
- [ ] **Step 2: Failing tests** in `preset.rs`:
  - `preflop_lists_parse`: a TOML with `open_bb = [2.0, 3.0, 4.0]` gives `values() == [2.0, 3.0, 4.0]`.
  - `scalar_size_is_a_list_of_one`: v1 `open_bb.values() == [2.5]`.
  - `list_of_one_serializes_as_scalar`: covered by the pins of Step 1 staying green.
  - `empty_or_small_preflop_list_is_rejected`: `open_bb = []` and `open_bb = [1.0]` give `PresetError::Invalid`.
  - `min_raise_defaults_to_false_and_parses`; `bucketing_defaults_to_hs2_and_parses_potential`.
  - `bucketing_changes_the_abstraction_toml`: potential vs hs2 differ; hs2 text has no `bucketing` key.
- [ ] **Step 3: Run** `cargo test -p mallorca-core preset` — the new tests fail to compile or fail.
- [ ] **Step 4: Implement** the types above; validation: every preflop list non-empty, every value finite and `> 1.0`
  (message stays "preflop sizes must be greater than 1"; empty list: "preflop size lists must not be empty").
  `tree.rs` takes the first value of each list for now.
- [ ] **Step 5: Run** `cargo test -p mallorca-core` — all pass, pins unchanged.
- [ ] **Step 6: Commit** `feat(solver): preflop size lists, min raise and bucketing in the preset`.

### Task 2: Tree with several preflop sizes and the minimum raise; v2 presets

**Files:**
- Modify: `solver/crates/core/src/tree.rs` (`raise_targets`, `action_kinds`)
- Create: `solver/presets/v2.toml`, `solver/presets/tiny-potential.toml`

**Interfaces:**
- Consumes: Task 1 types.
- Produces: presets `v2` (name "v2", v1 values except `buckets = [256, 256, 256]`, `bucketing = "potential"` and
  the sizes of Global Constraints) and `tiny-potential` (`tiny` with name "tiny-potential" and
  `bucketing = "potential"`).

- [ ] **Step 1: Failing tests** in `tree.rs`, on v2:
  - `v2_root_has_three_opens`: root actions `[Fold, Call, RaiseTo(40), RaiseTo(60), RaiseTo(80), AllIn]`.
  - `v2_big_blind_facing_limp_has_two_isos`: `[Check, RaiseTo(60), RaiseTo(90), AllIn]`.
  - `v2_three_bets_scale_with_the_open`: after `RaiseTo(60)`, BB has `RaiseTo(180), RaiseTo(240)`; after 4 bb,
    `RaiseTo(240), RaiseTo(320)`.
  - `v2_flop_bets`: after open 60 and call (pot 120), first-bet children are `RaiseTo(30), RaiseTo(79), RaiseTo(120),
    RaiseTo(180), RaiseTo(240)` (0.66×120 = 79.2 rounds to 79).
  - `v2_flop_raise_has_the_minimum`: after a flop bet of 120 into 120, raise children are `RaiseTo(240)` (min) and
    `RaiseTo(120 + 1.0 × 360) = RaiseTo(480)`, plus AllIn.
  - `every_action_is_legal` extended to v2 and tiny-potential.
  - `min_raise_off_keeps_v1`: covered by `v1_tree_bytes_are_pinned`.
- [ ] **Step 2: Run** `cargo test -p mallorca-core tree` — new tests fail.
- [ ] **Step 3: Implement** `raise_targets` returning all values of the level's list (preflop levels 0 to 2 by
  `aggressive`, unchanged meaning); with `min_raise`, postflop level 1 also yields `f64::from(min_to)` (pass `min_to`
  in or compute it there). Existing rounding, limit, dedup and sort apply.
- [ ] **Step 4: Run** `cargo test -p mallorca-core` — pass, v1 pins unchanged.
- [ ] **Step 5:** Run `cargo run --release -p mallorca-trainer -- tree --preset presets/v2.toml`; put the action slot
  count and memory estimate into the commit message body.
- [ ] **Step 6: Commit** `feat(solver): several preflop sizes and the minimum raise in the tree; v2 presets`.

### Task 3: Bot translation over several preflop opens

**Files:**
- Modify: `solver/crates/core/src/measure/mod.rs` (a second fixture), `solver/crates/core/src/bot/tests.rs`
- Modify only if a test fails: `solver/crates/core/src/bot/mod.rs`, `translate.rs`

**Interfaces:**
- Produces: `measure::fixtures::trained_multi_open() -> &'static Model` (or the fixture's existing return type):
  `tiny` with `open_bb = [2.0, 3.0, 4.0]`, trained in process like `trained()`.

- [ ] **Step 1: Failing or new tests** in `bot/tests.rs`, 2,000 draws each, opponent on the button opens and the bot
  is in the big blind:
  - `a_five_bb_open_maps_to_the_four_bb_child_mostly`: share of cursor on the 4 bb child ≥ 0.8 and equal to the
    pseudo-harmonic probability between 4 bb and all-in within 0.03.
  - `a_two_and_a_half_bb_open_splits_between_two_and_three`: both children seen, all-in never.
  - `a_ten_bb_open_is_answered_legally`: every move is legal for 2,000 draws.
- [ ] **Step 2: Run** `cargo test -p mallorca-core bot` — fail only if the generic code has a gap; fix in
  `bot/mod.rs` or `translate.rs` if so.
- [ ] **Step 3: Run** the full `cargo test -p mallorca-core`.
- [ ] **Step 4: Commit** `test(solver): preflop translation over several opens` (or `fix(solver): ...` with a fix).

### Task 4: Potential features in core

**Files:**
- Create: `solver/crates/core/src/potential.rs` (register in `lib.rs`)
- Modify: `solver/crates/core/src/iso.rs` (class weight)

**Interfaces:**
- Produces (`mallorca_core::potential`):
  - `pub const BINS: usize = 50; pub const CLUSTERS: usize = 8;`
  - `pub fn bin_of(hs: f32) -> usize` — `min((hs * 50) as usize, 49)`.
  - `pub fn emd(a: &[f32], b: &[f32]) -> f32` — sum over i of |cumsum a − cumsum b|, accumulated left to right in f32.
  - `pub fn l2(a: &[f32], b: &[f32]) -> f32` — squared distance, left to right.
  - `pub enum Metric { Emd, L2 }`; `pub fn nearest(metric, centroids: &[f32], dimension: usize, point: &[f32]) -> u16`
    — lowest index on ties.
  - `pub fn histogram(counts: &[u32; BINS]) -> [f32; BINS]` — counts / total.
  - `pub fn turn_counts(hole: [Card; 2], board: &[Card; 4], river: impl FnMut([Card;2], &[Card;5]) -> f32) -> [u32; BINS]`
    — over the 46 live river cards.
  - `pub fn flop_counts(hole, board: &[Card; 3], river: impl FnMut(..) -> f32) -> [u32; BINS]` — over 1081 runouts.
  - `pub fn ochs_live(hole: [Card;2], board: &[Card;5], clusters: &[u8; 169]) -> [f32; CLUSTERS]` — strength against
    live opponent holes of each cluster (wins + 0.5 ties over the cluster's live count), 0.5 when the count is 0.
- Produces (`iso.rs`): `pub fn class_weight(&self, round: usize, index: u64) -> u32` — the number of raw hands
  (hole set, board set) the canonical class stands for: distinct images of its representative under the 24 suit
  permutations.

- [ ] **Step 1: Failing tests:**
  - `emd_of_shifted_spikes`: spike at bin 0 vs bin 3 gives 3.0; identical gives 0; `emd(a,b) == emd(b,a)`.
  - `nearest_prefers_the_lower_index_on_ties`.
  - `bin_edges`: `bin_of(0.0) == 0`, `bin_of(1.0) == 49`, `bin_of(0.0199) == 0`, `bin_of(0.02) == 1`.
  - `turn_counts_sum_to_46` and `flop_counts_sum_to_1081` using `strength::river_hs`.
  - `draw_and_weak_pair_differ`: on `Jh Th 3c 2d` turn, `Qh 5h` (flush draw) and `3d 4s` (pair of threes) — assert
    `|mean equity difference| < 0.1` and `emd(histograms) > 5.0`. (If these exact hands miss the mean bound, pick a
    pair and draw that meet it and keep both assertions.)
  - `ochs_empty_cluster_is_half`: a clusters map where cluster 7 holds only holes containing a board card gives 0.5.
  - `class_weights_sum_to_raw_counts`: sum over flop classes of `class_weight(1, i)` == 25,989,600 (flop only in the
    fast test; turn 305,377,800 in an `#[ignore]` test).
- [ ] **Step 2: Run** `cargo test -p mallorca-core potential iso` — fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cargo test -p mallorca-core` and the wasm32 build of `mallorca-core`.
- [ ] **Step 5: Commit** `feat(solver): equity histograms, OCHS and EMD for potential-aware buckets`.

### Task 5: Batch river OCHS and batch/live agreement

**Files:**
- Modify: `solver/crates/core/src/potential.rs` (or `abstraction.rs` next to `river_strength`, whichever keeps the
  sort-based pass in one place)

**Interfaces:**
- Consumes: Task 4.
- Produces: `pub fn river_ochs(board: &[Card; 5], clusters: &[u8; 169]) -> Vec<(u64, [f32; CLUSTERS])>` — every live
  hole of the board with its river class index, the batch analogue of `river_strength`; and
  `pub fn preflop_class(hole: [Card; 2]) -> u8` if not already available from `street_indexers()[0]`.

- [ ] **Step 1: Failing test** `batch_and_live_features_agree`: for 200 boards drawn with `Rng::new(7)` and a fixed
  clusters map (`class % 8`), every `(index, v)` of `river_ochs` equals `ochs_live` of the unindexed hand bit for bit;
  and `turn_counts` with a lookup in a `river_strength`-built map equals `turn_counts` with `strength::river_hs` on 200
  turn classes.
- [ ] **Step 2: Run** — fails (no `river_ochs`).
- [ ] **Step 3: Implement** with the sorted-ranks trick of `river_strength`, one sorted rank list per cluster.
- [ ] **Step 4: Run** `cargo test -p mallorca-core`.
- [ ] **Step 5: Commit** `feat(solver): batch OCHS over a river board`.

### Task 6: Weighted k-means in the trainer

**Files:**
- Create: `solver/crates/trainer/src/kmeans.rs`; move `parallel_chunks` and `atomic_cells` from `buckets.rs` into
  `solver/crates/trainer/src/parallel.rs` (pub(crate)) so both use them.

**Interfaces:**
- Consumes: `potential::{Metric, nearest, emd, l2}`, `mallorca_core::rng::Rng`.
- Produces:
  `pub fn kmeans(points: &[f32], dimension: usize, weights: &[u32], k: usize, metric: Metric, seed: u64, threads: usize) -> Vec<f32>`
  returning `k × dimension` centroids sorted by ascending mean equity (`Emd`: mean of the histogram over bin centres;
  `L2`: plain mean of the coordinates); and `pub fn assign(points, dimension, centroids, metric, threads) -> Vec<u8>`.
  Seeding: weighted k-means++ (probability ∝ weight × distance). Lloyd: assign with `nearest`, recompute weighted means
  in f64, stop when no label changes or after 100 iterations. An empty cluster is reseeded with the point farthest from
  its centroid (lowest index on ties).

- [ ] **Step 1: Failing tests:**
  - `recovers_separated_clusters`: three spikes of 100 points each in L2 → 3 centroids at the spikes, sorted.
  - `same_seed_same_centroids`, `different_seed_may_differ_but_is_valid`.
  - `fewer_points_than_clusters`: 3 distinct points, k = 8 → 8 centroids, `assign` labels all `< 8`, no panic.
  - `weights_pull_the_mean`: two points, weights 1 and 3, k = 1 → centroid at the weighted mean.
  - `emd_centroids_are_histograms`: each EMD centroid sums to 1 within 1e-5.
- [ ] **Step 2: Run** `cargo test -p mallorca-trainer kmeans` — fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cargo test -p mallorca-trainer`.
- [ ] **Step 5: Commit** `feat(solver): weighted k-means for bucket tables`.

### Task 7: Centroid file and potential bucket pipeline

**Files:**
- Create: `solver/crates/core/src/centroids.rs` (pure encode/decode)
- Create: `solver/crates/trainer/src/potential.rs` (the pipeline)
- Modify: `solver/crates/trainer/src/buckets.rs` (`run` dispatches on `preset.bucketing`)

**Interfaces:**
- Produces (`mallorca_core::centroids`):
  `pub struct Centroids { pub clusters: [u8; 169], pub turn: Vec<f32>, pub river: Vec<f32> }` with
  `pub fn encode(&self) -> Vec<u8>` and `pub fn decode(&[u8]) -> Result<Centroids, CentroidsError>`. Layout: magic
  `MLCC`, version u16 = 1, 169 bytes cluster map, then for turn and river: count u16, dimension u16, count × dimension
  f32 LE. Turn dimension 50, river 8.
- Produces (trainer): `buckets --preset tiny-potential.toml --out DIR` writes `flop.bkt`, `turn.bkt`, `river.bkt`,
  `river_hs.f32`, `centroids.bin`. Pipeline order: river HS pass (existing) → preflop histograms over all boards →
  8 OCHS clusters (k-means EMD, all 169 classes, weights = raw combos 6/4/12) → river OCHS pass (sample of at most
  5M classes by board stride for k-means, then a full pass assigning) → turn counts from `river_hs.f32` (sample, k-means
  EMD, full assignment) → flop counts (all classes, k-means EMD, assignment). Weights from `class_weight`.

- [ ] **Step 1: Failing tests:** `centroids_round_trip`; `bad_magic_version_and_lengths_are_rejected` in core.
  In trainer, `#[ignore]` `potential_buckets_on_tiny`: run the pipeline with `tiny-potential` into a temp dir; assert
  every table value `< 8`, all 8 buckets used on each street, `centroids.bin` decodes with counts 8 and dimensions
  50/8, and on the turn the flush draw and the pair from Task 4 get different buckets.
- [ ] **Step 2: Run** — fail.
- [ ] **Step 3: Implement.** Print progress lines like the existing `buckets` command.
- [ ] **Step 4: Run** `cargo test --release -p mallorca-trainer -- --include-ignored potential_buckets_on_tiny`;
  note wall time in the commit body.
- [ ] **Step 5: Commit** `feat(solver): potential-aware bucket tables and centroid file`.

### Task 8: Strategy format 3 and the centroid bucket source

**Files:**
- Modify: `solver/crates/core/src/strategy.rs`, `solver/crates/core/src/abstraction.rs`, `solver/STRATEGY_FORMAT.md`

**Interfaces:**
- Consumes: `centroids::Centroids`, `potential::*`.
- Produces:
  - `KIND_CENTROIDS: u8 = 2`, `CENTROID_FORMAT_VERSION: u16 = 3`. Section: `count u16, dimension u16,
    count × dimension f32`; the river section is followed by 169 bytes of cluster map. `count` must equal the street's
    bucket count; dimension 50 on turn, 8 on river; values finite.
  - `StrategyFile.centroids: Vec<(Street, Vec<f32>)>`, `StrategyFile.clusters: Option<[u8; 169]>`,
    `with_centroids(self, Vec<(Street, Vec<f32>)>, [u8;169]) -> Self`, `centroids_of(Street) -> Option<&[f32]>`.
    `to_bytes` writes version 3 iff centroids are present, else as today.
  - `BucketSource::Centroids { centroids: Vec<f32>, dimension: usize, clusters: [u8; 169] }`;
    `Abstraction::bucket` on such a street: turn → `nearest(Emd, .., histogram(turn_counts(.., strength::river_hs)))`,
    river → `nearest(L2, .., ochs_live(..))`. `from_strategy` accepts centroids on turn and river.
- [ ] **Step 1: Failing tests** in `strategy.rs`: `centroid_file_round_trips_as_version_three`,
  `centroid_count_must_match_buckets`, `centroid_dimension_must_match_street`, `centroid_values_must_be_finite`,
  `shipped_v1_play_file_still_loads` (read `../../../web/src/cfr/v1.mlcs.gz`, gunzip with the existing dev
  dependency or `flate2` dev-dependency, `from_bytes` is Ok and version 2), `version_four_is_rejected`.
  In `abstraction.rs`: `centroid_source_matches_nearest_of_live_feature` on a few hands with hand-made centroids.
- [ ] **Step 2: Run** — fail.
- [ ] **Step 3: Implement**; update `STRATEGY_FORMAT.md` to "versions 1, 2 and 3" with the section above.
- [ ] **Step 4: Run** `cargo test -p mallorca-core` and both wasm builds.
- [ ] **Step 5: Commit** `feat(solver): strategy format 3 with turn and river centroids`.

### Task 9: Play export with centroids and verification

**Files:**
- Modify: `solver/crates/trainer/src/export.rs`, `solver/crates/trainer/src/thresholds.rs` (or a new
  `solver/crates/trainer/src/verify.rs` for the centroid check)

**Interfaces:**
- Consumes: Task 7 outputs in the data directory, Task 8 `with_centroids`.
- Produces: `export --streets play` on a potential preset writes flop table + turn/river centroids + cluster map. Before
  writing, every turn class is recomputed from `river_hs.f32` (`turn_counts` with lookup) and every river class from
  the `river_ochs` board pass; the first class whose `nearest` differs from the table is an error naming street and
  class. On an `hs2` preset, behaviour is unchanged.
- [ ] **Step 1: Failing tests** (`#[ignore]`, reuse the Task 7 tiny-potential data dir via a shared helper):
  `play_export_with_centroids_reproduces_every_bucket` (export builds, file is version 3, and
  `Abstraction::from_strategy` buckets equal the tables on 10,000 sampled turn and river hands);
  `a_tampered_table_is_refused` (flip one turn table byte → export errors with the street and class).
- [ ] **Step 2: Run** — fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cargo test --release -p mallorca-trainer -- --include-ignored export`.
- [ ] **Step 5: Commit** `feat(solver): play export with potential-aware centroids`.

### Task 10: End to end, WASM, docs

**Files:**
- Modify: `solver/crates/trainer/tests/end_to_end.rs`, `solver/crates/wasm/src/tests.rs`, `solver/README.md`,
  `ARCHITECTURE.md` (only where it states the strategy format versions or bucket sources)

- [ ] **Step 1: Failing tests:** `tiny_potential_runs_through_every_subcommand` (`#[ignore]`): `buckets`, `tree`,
  `train` (20,000 iterations, 2 threads), `export --streets play`, `lbr` (small hand count), `match --opponent all`,
  all succeed; the play file is version 3. In wasm tests, `a_bot_plays_a_hand_on_a_centroid_file`: build a small
  version 3 file in process (tiny tree, hand-made centroids) and play a hand through `load`, `bot_new`, `decide`.
- [ ] **Step 2: Run** — fail, then make them pass (fixes go where they fail).
- [ ] **Step 3:** Measure one turn bucket in release WASM under Node (a throwaway script in the scratchpad, not
  committed) and note ms in the PR body.
- [ ] **Step 4: Docs:** `solver/README.md` gets the v2 commands (`buckets --preset presets/v2.toml`, `train`,
  `export --streets play`) and the v2 tree size from Task 2.
- [ ] **Step 5: Run** the full pre-commit list of Global Constraints plus
  `cargo test --release -- --include-ignored`.
- [ ] **Step 6: Commit** `test(solver): potential-aware blueprint end to end` and `docs(solver): v2 presets`.
