# Coach strategy core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The CFR bot exposes, through `mallorca.wasm` and `CfrBot`, the bot's own range narrowed by its actions,
the spot it would decide at, and the strategy of every hole-card pair in that spot.

**Architecture:** All strategy reading lives in `mallorca-core::bot`. A batched bucketer in `abstraction.rs`
buckets all 1326 pairs of a board at once and equals the per-pair `bucket` exactly. The bot records the strategy
steps it sampled; `range` replays them over all pairs. `spot` finds the node `decide` would use without moving the
bot; `strategy_grid` reads that node for all pairs. `mallorca-wasm` writes each into a seat-owned buffer, and
`web/src/cfr/model.ts` mirrors the new exports.

**Tech Stack:** Rust (pinned toolchain in `solver/`), `wasm32-unknown-unknown`, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-coach-range-design.md` (section "Rust", "The strategy from both seats";
this plan is delivery step 1).

## Global Constraints

- No comments in code or config, in any language. No `#[allow]`, no `eslint-disable`, no loosened tolerance.
- `mallorca-core` stays pure and builds for `wasm32-unknown-unknown`.
- TDD: the failing test first. Slow tests are `#[ignore]` and run with `cargo test --release -- --include-ignored`.
- Pair index: for cards `a < b` in 0..52, `pair_index(a, b) = b * (b - 1) / 2 + a`, 0..1326.
- Probability of a tree action: its quantized byte over the sum of the node's bytes for that bucket.
- Performance target: a full river range and strategy grid under 150 ms in release WASM on a desktop.
- Before every commit in `solver/`: `cargo fmt --all`, `cargo clippy --all-targets -- -D warnings`, `cargo test`,
  `cargo build -p mallorca-core --target wasm32-unknown-unknown`,
  `cargo build --release -p mallorca-wasm --target wasm32-unknown-unknown`. In `web/`: `npm run lint`,
  `npx tsc --noEmit`, `npm test`.
- Commits: `feat(solver): ...` for Rust, `feat(cfr): ...` for TS, `docs: ...`; `git branch --show-current` first.

## Review Focus

- A board whose pairs fall on a bucket threshold exactly: the batched bucket must equal the per-pair one, not differ
  by float summation order. Pinned in Task 1 by comparing every pair on boards from the trained fixture's play.
- A hand where the bot never sampled (it only played passive off the tree): the range is uniform over live pairs.
  Pinned in Task 2.
- A bot whose every pair has probability 0 for the observed action (an off-tree resync to a node that never takes
  it): the range must not become all zeros; it falls back to the range before that step. Pinned in Task 2.
- `spot` called twice, or before `decide`, must not change what `decide` then plays. Pinned in Task 3.
- An ABI call on a freed or unknown seat returns a null pointer, and a stale pointer is never read by TS after the
  next call. Pinned in Task 4.

---

### Task 1: Batched buckets for every pair of a board

**Files:**
- Create: `solver/crates/core/src/pairs.rs` (pair index and its inverse)
- Modify: `solver/crates/core/src/lib.rs`, `solver/crates/core/src/abstraction.rs`
- Test: `solver/crates/core/src/abstraction.rs` tests module, `solver/crates/core/src/pairs.rs` tests

**Interfaces:**
- Produces: `pub const PAIRS: usize = 1326`, `pub fn pair_index(a: Card, b: Card) -> usize` (order-free),
  `pub fn pair_cards(i: usize) -> [Card; 2]` (ascending), in `crate::pairs`.
- Produces: `Abstraction::buckets(&self, street: Street, board: &[Card]) -> Vec<u16>`, length `PAIRS`,
  `u16::MAX` for a pair that touches the board.

- [ ] **Step 1: Write the failing tests**

`pairs_round_trip`: for every `i < PAIRS`, `pair_index(c[0], c[1]) == i` and `pair_index(c[1], c[0]) == i` with
`c = pair_cards(i)`, and `c[0] < c[1]`.

`batched_buckets_equal_per_pair_buckets`: for the thresholds abstraction and the centroid abstraction already built
in the tests module, and for the table flop, on three boards per street (a rainbow, a two-tone and a paired board),
every pair `i` not touching the board has `buckets(street, board)[i] == bucket(street, pair_cards(i), board)`, and
every pair touching it has `u16::MAX`. Preflop: `buckets(Preflop, &[])[i] == bucket(Preflop, pair_cards(i), &[])`.

`#[ignore] batched_river_and_turn_are_fast`: release, live centroid turn and river, under 150 ms each measured in
the test with `std::time::Instant` (the test module may use `std::time`; core code may not).

- [ ] **Step 2: Run them to see them fail** — `cargo test -p mallorca-core pairs` and `... batched`; expected:
  compile errors for the missing items.

- [ ] **Step 3: Implement**

`Table` and preflop: per-pair lookup. Live sources must reproduce the per-pair float arithmetic exactly, so share
work by memoizing, not by reordering sums:
- River thresholds: one `river_strength(board)` call, mapped by river iso index to `hs`.
- Turn thresholds (`turn_value`): a `HashMap<u64, f32>` from river iso index to `hs`, filled by one
  `river_strength` per distinct five-card board the canonical aggregation visits; `turn_value` is then the same
  `aggregate_squares` over the same canonical cards with a lookup instead of `river_hs`. Factor `turn_value` into
  a function that takes the river value as a closure so both paths run one body.
- Turn centroids: `turn_counts(hole, board, lookup)` with the same memo.
- River centroids: one `river_ochs(board, clusters)` call, mapped by river iso index.

- [ ] **Step 4: Run the tests** — `cargo test -p mallorca-core` and
  `cargo test -p mallorca-core --release -- --include-ignored batched_river_and_turn_are_fast`; expected: pass.

- [ ] **Step 5: Commit** — `feat(solver): bucket every hole-card pair of a board at once`

### Task 2: The bot's range

**Files:**
- Create: `solver/crates/core/src/bot/range.rs`
- Modify: `solver/crates/core/src/bot/mod.rs`
- Test: `solver/crates/core/src/bot/tests.rs`

**Interfaces:**
- Consumes: `Abstraction::buckets`, `PAIRS`, `pair_cards` (Task 1).
- Produces: `pub struct Step { pub node: NodeId, pub action: usize, pub street: Street, pub board: Vec<Card> }`;
  `Bot::history(&self) -> &[Step]`; `Bot::range(&self, model: &Model) -> Vec<f32>` (length `PAIRS`).

- [ ] **Step 1: Write the failing tests**

`a_new_hand_has_a_uniform_range`: after `hand_started` and `hole_cards`, `history()` is empty and every entry of
`range` is 1.0.

`a_sampled_decision_adds_one_step`: preflop open with `draw_for(root, bucket, RaiseTo(50))` adds one step with the
root node and the index of `RaiseTo(50)`.

`the_range_follows_the_strategy`: after that open, for every pair `i`,
`range[i] == p(root, bucket(pair_cards(i)), RaiseTo(50))` within 1e-6.

`board_pairs_leave_the_range`: after `street` with a flop, every pair touching it is 0.0 in `range`.

`a_passive_play_off_the_tree_adds_no_step`: a decision with `hand.node == None` (the `invalid_hole_cards` setup or a
lost cursor with no resync target) leaves `history()` unchanged.

`an_impossible_step_keeps_the_previous_range`: a hand-built history whose step has probability 0 for every live
pair leaves `range` equal to the range without that step.

- [ ] **Step 2: Run them to see them fail** — `cargo test -p mallorca-core bot::`; expected: compile errors.

- [ ] **Step 3: Implement**

`Hand` gains `history: Vec<Step>`, cleared by `hand_started`. `decide` pushes a step right where it samples
(`sample(probabilities, draw)`), with `hand.street` and `hand.board`. `range` starts at 1.0 for live pairs of the
current board, then per step computes `buckets(step.street, &step.board)` once and multiplies each live pair by the
action probability of its bucket, reading `probabilities(node, bucket)` once per distinct bucket. If a step leaves
every pair at 0, skip that step.

- [ ] **Step 4: Run the tests** — `cargo test -p mallorca-core`; expected: pass.

- [ ] **Step 5: Commit** — `feat(solver): the bot's range from the strategy steps it sampled`

### Task 3: The spot and its strategy grid

**Files:**
- Create: `solver/crates/core/src/bot/spot.rs`
- Modify: `solver/crates/core/src/bot/mod.rs`
- Test: `solver/crates/core/src/bot/tests.rs`

**Interfaces:**
- Consumes: `Abstraction::buckets`, `PAIRS` (Task 1).
- Produces: `pub struct SpotView { pub node: NodeId, pub street: Street, pub moves: Vec<Move>, pub approximate: bool }`;
  `Bot::spot(&self, model: &Model, legal: &Legal) -> Option<SpotView>`;
  `Bot::strategy_grid(&self, model: &Model, spot: &SpotView) -> Vec<f32>`, `PAIRS * moves.len()` values, row `i`
  the probabilities of pair `i`, all 0.0 for a pair that touches the board or the bot's hole cards.

- [ ] **Step 1: Write the failing tests**

`spot_is_the_node_decide_samples`: on the root and on a flop node reached by `acted`, `spot(legal).node` equals the
node whose child `cursor()` points to after `decide` and `acted(true, ...)`.

`spot_moves_are_the_real_moves`: each `moves[k]` equals what `to_real` gives for the node's action `k` under `legal`.

`spot_does_not_move_the_bot`: two `spot` calls before `decide` leave the move `decide` plays with a fixed draw
unchanged, compared with a bot that never called `spot`.

`approximate_after_a_resync`: after a lost cursor (the `a_lost_cursor_resyncs_to_the_hero_spot` setup) `approximate`
is true; on the tree it is false.

`grid_rows_are_the_strategy`: each live row sums to 1 within 1e-6 and equals the node's bytes of that pair's bucket
over their sum; rows of pairs touching the board or the hole cards are 0.0.

`no_spot_without_a_node`: `spot` returns None where `decide` would play `passive(legal)` without sampling.

- [ ] **Step 2: Run them to see them fail** — `cargo test -p mallorca-core bot::`; expected: compile errors.

- [ ] **Step 3: Implement**

Split `decide`'s node selection into `fn decision_node(&self, model, legal) -> Option<(NodeId, bool)>` that does not
mutate: it mirrors the validity check and `resync`, takes the non-shifted branch of `resync_to_check`, and returns
`approximate = true` when it resynced or the hand is `shifted`. `decide` keeps its sampling and mutation and uses the
same helper for the parts that do not depend on the draw, so the two cannot drift. `moves` come from `to_real` per
action.

- [ ] **Step 4: Run the tests** — `cargo test -p mallorca-core`; expected: pass, including every existing bot test.

- [ ] **Step 5: Commit** — `feat(solver): the bot's spot and the strategy of every pair in it`

### Task 4: WASM ABI and the TS mirror

**Files:**
- Modify: `solver/crates/wasm/src/lib.rs`, `solver/crates/wasm/src/tests.rs`
- Modify: `web/src/cfr/model.ts`, `web/src/cfr/index.ts` (export the new types only if another layer needs them;
  none does in this PR, so `index.ts` stays unless lint asks)
- Test: `web/src/cfr/abi.test.ts`
- Modify: `ARCHITECTURE.md` (section `cfr`)

**Interfaces:**
- Consumes: `Bot::range`, `Bot::spot`, `Bot::strategy_grid` (Tasks 2, 3).
- Produces (ABI): `bot_range(bot) -> *const f32` (1326 values); `bot_spot(bot, fold, check, call, raise_min,
  raise_max) -> *const f32` laid out `[approximate, n, kind_0, to_0, ..., kind_{n-1}, to_{n-1}]` with the `KIND_*`
  codes; `bot_spot_grid(bot) -> *const f32` (`1326 * n`, for the last `bot_spot`). A null pointer for an unknown or
  freed seat, no hand, or no spot. Buffers live in `Seat` and stay valid until the next call on that seat.
- Produces (TS): on `CfrBot`, `range(): Float32Array | null`, `spot(legal: LegalActions): CfrSpot | null` with
  `interface CfrSpot { approximate: boolean; moves: Action[]; grid: Float32Array }`. Both copy out of WASM memory
  before returning.

- [ ] **Step 1: Write the failing tests**

Rust (`wasm/src/tests.rs`): `range_of_a_fresh_hand_is_uniform`, `spot_layout_matches_the_core_spot` (decode the
buffer and compare with `Bot::spot` on the same play), `grid_matches_the_core_grid`, `unknown_seat_gives_null` for
all three exports, and `freed_seat_gives_null`.

TS (`abi.test.ts`, new `describe('the coach exports of mallorca.wasm')`): on the shipped `cfr` file, aces on the
button before the flop: `range()` has 1326 entries all 1; `spot(legal)` has `approximate` false, its `moves` are
legal under `legal`, and the grid row of `As Ah` sums to 1 within 1e-5 and puts its largest share on a raise. After
the bot opens and the flop is dealt, `range()` is 0 for pairs touching the flop and not all equal elsewhere.

- [ ] **Step 2: Run them to see them fail** — `cargo test -p mallorca-wasm`; `npm test -- src/cfr/abi.test.ts`
  from `web/`; expected: missing exports.

- [ ] **Step 3: Implement** the three exports over `with_seat` and the TS mirror in `model.ts` (`Exports` gains
  the three functions; reading uses a `Float32Array` view over `memory.buffer`, then `slice()`).

- [ ] **Step 4: Run all checks** of Global Constraints in `solver/` and `web/`; expected: all pass.

- [ ] **Step 5: Update `ARCHITECTURE.md`** (`cfr`: the three exports, buffer lifetime, `CfrBot.range` and
  `CfrBot.spot`, the pair index), then commit: `feat(cfr): range, spot and strategy grid over the wasm ABI`.

### Task 5: Pull request

- [ ] Run the full pre-PR list from `CLAUDE.md` in `web/` (`lint`, `tsc`, `test`, `test:golden`, `build`,
  `test:e2e`) and the Rust list in `solver/`; push `feat/coach-range-heatmap` with `git push -u origin
  feat/coach-range-heatmap`; open the PR against `master` referencing #5 (delivery step 1 of the spec). Squash-merge
  only on the owner's confirmation.
