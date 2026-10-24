# Turn and River Subgame Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The CFR bot solves the turn and river at play time (real board, pot, stacks, sizes) instead of following the blueprint there, and the arena measures `cfr-solve` against `cfr` and `math`.

**Architecture:** A pure module `mallorca-core::subgame` (combos, ranges, a subgame tree in real chips, vectorised terminal values, vectorised DCFR). `bot::Bot` tracks both players' ranges by Bayes over the blueprint on preflop and flop and, when the solver is on, solves from the start of the turn or river with the street's real actions inserted. One new WASM export turns the solver on; the web passes options through `CfrModel.newBot`, and the arena gets a `cfr-solve` bot.

**Tech Stack:** Rust (pinned toolchain in `solver/rust-toolchain.toml`, wasm32-unknown-unknown), TypeScript, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-24-turn-river-solver-design.md`

## Global Constraints

- Rust: run from `solver/` with `PATH=$HOME/.cargo/bin:$PATH`. Before every commit: `cargo fmt --all`, `cargo clippy --all-targets -- -D warnings`, `cargo test`, `cargo build -p mallorca-core --target wasm32-unknown-unknown`.
- `mallorca-core` is pure: no `std::time`, `std::fs`, `std::env`, thread-locals or global RNG. Randomness enters as `&mut Rng` or an `f64` draw.
- Web: `source ~/.nvm/nvm.sh && nvm use` in `web/`; before every commit `npm run lint`, `npx tsc --noEmit`, `npm test`. ESLint limits on non-test files in `src` and `tools`: 400 lines per file, 60 lines per function, depth 3, complexity 12, 4 parameters, no import cycles.
- No comments in code or config, in any language. No `#[allow]`, `eslint-disable`, loosened tolerance or deleted assertion.
- TDD: write the failing test, run it, see it fail, then the code.
- Cards are `u8` 0..51, `rank * 4 + suit`; `parse_cards("As Kd")` in `crate::cards`.
- Commits: conventional, scope `solver` for Rust, `cfr` or `arena` or `game` for web, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Run `git branch --show-current` first; the branch is `feat/subgame-solver`.
- Seats follow `bot`: seat 0 is the button (small blind), seat 1 the big blind; postflop seat 1 acts first.
- Chips are real chips everywhere in `subgame`; street bets count from the street start.
- Sizes (spec decision 4): turn and river both bet `[0.5, 1.0]`, raise `[1.0]` (fractions of the pot after the call), all-in always, at most 3 aggressive actions per street, a size above `2/3` of the stack behind becomes all-in, a size below the legal minimum becomes the minimum, duplicates merged. Minimum bet one big blind, minimum raise increment the last increment and at least one big blind.
- DCFR parameters: alpha 1.5, beta 0, gamma 2, alternating updates.

## Review Focus

- An opponent turn or river bet of a size not in the tree (for example 1 bb or 0.6 pot): the bot re-solves with that size and answers with a legal move. Test in Task 6.
- Short effective stack at the street start (for example 3 bb behind into a 20 bb pot): the tree holds only all-in or call, no panic, legal answer. Tests in Task 2 and Task 6.
- A range that sums to zero after Bayes (a resync, or a hand the blueprint never plays this way): that player's range resets to uniform over live combos, no NaN in any strategy. Tests in Task 1 and Task 5.
- A combo with zero reach or zero strategy sum: `strategy` returns the uniform distribution, never NaN. Test in Task 4.
- Bigger blinds and deeper stacks (50/100, 300 bb): the subgame uses real chips; the property test covers them. Test in Task 6.

---

### Task 1: Combos and ranges

**Files:**
- Create: `solver/crates/core/src/subgame/mod.rs`, `solver/crates/core/src/subgame/combos.rs`, `solver/crates/core/src/subgame/range.rs`
- Modify: `solver/crates/core/src/lib.rs` (add `pub mod subgame;`)

**Interfaces:**
- Produces in `subgame::combos`: `pub const COMBOS: usize = 1326;`, `pub fn combo_index(a: Card, b: Card) -> usize` (order of `a`, `b` does not matter), `pub fn combo_cards(i: usize) -> [Card; 2]` (lower card first), `pub fn card_mask(cards: &[Card]) -> u64`.
- Produces in `subgame::range`: `#[derive(Clone, Debug, PartialEq)] pub struct Range { pub weights: Vec<f32> }` (length `COMBOS`) with `pub fn uniform() -> Range` (all 1.0), `pub fn without(&self, dead: &[Card]) -> Range` (combos touching `dead` set to 0), `pub fn update(&mut self, p: impl Fn([Card; 2]) -> f32)` (multiplies each positive weight by `p`), `pub fn total(&self) -> f64`, `pub fn or_uniform(self, dead: &[Card]) -> Range` (returns `Range::uniform().without(dead)` when `total()` is 0 or not finite, else `self`).

- [ ] **Step 1: Write the failing tests** in `combos.rs` and `range.rs` `#[cfg(test)] mod tests`:
  - `every_index_round_trips`: for all `i < COMBOS`, `combo_index(c[0], c[1]) == i` and `combo_index(c[1], c[0]) == i` where `c = combo_cards(i)`, and `c[0] < c[1]`; the 1326 pairs are distinct.
  - `card_mask_sets_one_bit_per_card`: `card_mask(&parse_cards("2c As").unwrap()) == (1 << 0) | (1 << 51)`.
  - `without_zeroes_combos_on_the_board`: on board `"Kh 7d 2c"` the uniform range keeps `1176` positive weights (C(49,2)), and `weights[combo_index(Kh, As)] == 0.0`.
  - `update_multiplies`: after `update(|c| if c[0] % 4 == 0 { 0.5 } else { 1.0 })` a club-low combo weighs 0.5.
  - `an_empty_range_resets_to_uniform`: a range of zeros `or_uniform(&board)` equals `Range::uniform().without(&board)`; a non-empty range is returned unchanged.
- [ ] **Step 2: Run** `cargo test -p mallorca-core subgame` — expected: compile failure (module missing).
- [ ] **Step 3: Implement** the two files; `combo_index` by the triangular formula `b*(b-1)/2 + a` for `a < b`.
- [ ] **Step 4: Run** `cargo test -p mallorca-core subgame` — expected: PASS.
- [ ] **Step 5: Commit** `feat(solver): combos and ranges for the subgame solver`.

### Task 2: Subgame tree in real chips

**Files:**
- Create: `solver/crates/core/src/subgame/tree.rs`
- Modify: `solver/crates/core/src/subgame/mod.rs`

**Interfaces:**
- Consumes: `crate::tree::Street`, `crate::cards::Card`.
- Produces:
  - `#[derive(Clone, Debug, PartialEq)] pub struct StreetSizes { pub bets: Vec<f64>, pub raises: Vec<f64>, pub max_aggressive: u8, pub all_in_threshold: f64 }` with `pub fn standard() -> StreetSizes` (values from Global Constraints).
  - `#[derive(Clone, Debug, PartialEq)] pub struct Sizes { pub turn: StreetSizes, pub river: StreetSizes }`, `impl Default`.
  - `#[derive(Clone, Copy, Debug, PartialEq, Eq)] pub struct Root { pub street: Street, pub pot: u32, pub behind: u32, pub big_blind: u32 }` (`pot` is both players' total so far, contributed equally; `behind` is the effective stack).
  - `#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)] pub enum SubAction { Fold, Check, Call, RaiseTo(u32) }` (`RaiseTo` is the acting player's street total).
  - `#[derive(Clone, Debug, PartialEq)] pub enum SubNode { Decision { seat: u8, river: bool, actions: Vec<(SubAction, usize)> }, Chance { child: usize }, Fold { folder: u8, contributed: [u32; 2] }, Showdown { river: bool, contributed: u32 } }` (`river` is true below the chance node of a turn tree and on every node of a river tree; `contributed` is each player's total including `pot / 2`).
  - `pub struct SubTree { pub root: Root, pub nodes: Vec<SubNode> }` with `pub fn build(root: Root, sizes: &Sizes, path: &[SubAction]) -> SubTree` (node 0 is the root decision, seat 1 to act), `pub fn node_at(&self, path: &[SubAction]) -> Option<usize>` (follows `path` from node 0 through decisions only), `pub fn parent_edges(&self) -> Vec<Option<(usize, usize)>>` (for each node the parent and the action index that leads to it).
- Rules: on a turn tree, the round ending in check-check or a call (not all-in for both) leads to `Chance { child }` and one river round below it, built once (the solver duplicates it per river card); if both are all-in the call leads to `Showdown { river: false, .. }` meaning the solver runs out the river by averaging. The `path` actions are inserted where they occur when missing (only `RaiseTo` can be missing); a `path` action that is illegal (raise past all-in, raise when none allowed) is clamped to the nearest legal action before insertion.

- [ ] **Step 1: Write the failing tests** in `tree.rs`:
  - `river_root_offers_check_and_bets`: `Root { street: River, pot: 400, behind: 1800, big_blind: 20 }`, default sizes, empty path. Node 0 is `Decision { seat: 1, river: true, .. }` with actions `[Check, RaiseTo(200), RaiseTo(400), RaiseTo(1800)]`.
  - `facing_a_bet_offers_fold_call_raise`: the child of `RaiseTo(200)` is seat 0 with `[Fold, Call, RaiseTo(1000), RaiseTo(1800)]` (raise to = opponent bet + fraction × pot after the call = 200 + 1.0 × 800).
  - `big_sizes_become_all_in`: `pot: 400, behind: 300`: actions are `[Check, RaiseTo(200), RaiseTo(300)]` (0.5 pot = 200 ≤ 2/3 × 300; 1.0 pot = 400 > 300 → all-in, merged).
  - `short_stack_only_jams`: `pot: 400, behind: 15, big_blind: 20`: `[Check, RaiseTo(15)]`; facing it `[Fold, Call]`.
  - `turn_round_ends_in_a_chance_node`: turn root, check-check leads to `Chance { child }` whose child is `Decision { seat: 1, river: true, .. }`; a turn call of an all-in leads to `Showdown { river: false, contributed: pot/2 + behind }`.
  - `fold_and_showdown_contributions`: river bet 200, call: `Showdown { river: true, contributed: 400 }`; bet 200, fold: `Fold { folder: 0, contributed: [200, 400] }`.
  - `path_inserts_an_off_tree_size`: path `[RaiseTo(60)]` on the river root with `pot 400`: the root gains `RaiseTo(60)` (sorted with the others) and `node_at(&[RaiseTo(60)])` is a seat-0 decision; `node_at(&[RaiseTo(61)])` is `None`.
  - `min_raise_holds`: facing `RaiseTo(20)` (one bb into 400), every raise is at least `40`, and `max_aggressive` caps a fourth raise (only fold/call remain).
- [ ] **Step 2: Run** `cargo test -p mallorca-core subgame::tree` — expected: FAIL (missing).
- [ ] **Step 3: Implement** `build` as a recursive builder over a small state (`seat`, `street_bets: [u32; 2]`, `last_increment`, `aggressive`, `river`, path cursor); keep functions short.
- [ ] **Step 4: Run** the tests — expected: PASS.
- [ ] **Step 5: Commit** `feat(solver): subgame tree in real chips`.

### Task 3: Terminal values with card removal

**Files:**
- Create: `solver/crates/core/src/subgame/showdown.rs`
- Modify: `solver/crates/core/src/subgame/mod.rs`

**Interfaces:**
- Consumes: `combos::{COMBOS, combo_cards, card_mask}`, `crate::eval::rank`.
- Produces:
  - `pub struct Board { pub cards: Vec<Card>, pub live: Vec<usize> }` with `pub fn new(cards: &[Card]) -> Board` (`live` is the combo indices that do not touch the board, ascending). All value functions below work on vectors indexed by position in `live` (length `live.len()`).
  - `pub fn fold_values(board: &Board, opp: &[f32], payoff: f32, out: &mut [f32])`: `out[i] = payoff * Σ_j opp[j]` over live `j` sharing no card with `i`, by inclusion-exclusion (total, minus per-card sums, plus `opp[i]`).
  - `pub struct Ranking` with `pub fn new(board: &Board) -> Ranking` (needs 5 board cards; sorts live combos by `rank` of the 7 cards) and `pub fn values(&self, opp: &[f32], payoff: f32, out: &mut [f32])`: `out[i] = payoff * (Σ opp[j] over compatible weaker j − Σ opp[j] over compatible stronger j)`, O(n) after the sort with per-card running sums; ties count zero.
  - `pub fn card_filter(board: &Board, card: Card) -> Vec<usize>`: positions in `live` of combos that hold `card` (for the river chance mask).

- [ ] **Step 1: Write the failing tests**:
  - `fold_values_match_brute_force` and `showdown_values_match_brute_force`: for 20 seeds (`Rng::new(seed)`), a random 5-card board, random `opp` weights in `[0, 1)` with about a third zeroed, `payoff = 3.0`; compare against a double loop over live combos with `card_mask` overlap checks, `|a − b| <= 1e-3 * (1 + |b|)`.
  - `fold_values_on_a_turn_board`: same check with 4 board cards.
  - `ties_are_zero`: on board `"As Ks Qs Js Ts"` every showdown value is 0 for any `opp`.
- [ ] **Step 2: Run** `cargo test -p mallorca-core subgame::showdown` — expected: FAIL.
- [ ] **Step 3: Implement.** Showdown: walk the sorted order in groups of equal rank; before a group, the weaker sums (total and per card) are those of all earlier groups; value of `i` = (weaker_total − weaker[c0] − weaker[c1]) − (stronger_total − stronger[c0] − stronger[c1]), with the stronger sums obtained as totals minus weaker minus the group's own.
- [ ] **Step 4: Run** the tests — expected: PASS.
- [ ] **Step 5: Commit** `feat(solver): vectorised fold and showdown values with card removal`.

### Task 4: Vectorised DCFR solver

**Files:**
- Create: `solver/crates/core/src/subgame/solver.rs` (and `solver/crates/core/src/subgame/tests.rs` for the equilibrium tests if `solver.rs` grows past about 400 lines)
- Modify: `solver/crates/core/src/subgame/mod.rs`

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces `pub struct Solver` with:
  - `pub fn new(tree: SubTree, board: &[Card], ranges: [Range; 2]) -> Solver` (board has 4 cards for a turn tree, 5 for a river tree; ranges are by seat and are masked by the board internally).
  - `pub fn run(&mut self, iterations: u32)` (continues from the current state; iteration count accumulates).
  - `pub fn iterations(&self) -> u32`.
  - `pub fn strategy(&self, node: usize, river: Option<Card>, hole: [Card; 2]) -> Vec<f32>` (average strategy, sums to 1; uniform when the strategy sum is 0; `river` is required exactly for nodes with `river: true` in a turn tree and ignored otherwise).
  - `pub fn action_evs(&self, node: usize, river: Option<Card>, hole: [Card; 2]) -> Vec<f32>` (chips, for the acting player's combo, each action's value under the average strategy of both players, normalised by the opponent's reach so it is an expectation).
  - `pub fn ranges_at(&self, node: usize, river: Option<Card>) -> [Range; 2]` (root ranges times each player's average-strategy probabilities along the path to `node`).
  - `pub fn exploitability(&self) -> f64` (chips: mean over both players of best-response value against the other's average strategy minus that player's equilibrium share, so 0 at an equilibrium; computed as `(br0 + br1) / 2` where `br_p` is the best-response value of player p per unit of joint reach, which in a zero-sum game sums to the exploitability).
- Algorithm: one traversal per player per iteration over the tree with the opponent's reach vector; regrets and strategy sums per (decision node, river card slot, live combo, action) in `f32`, laid out contiguously per node; DCFR discount after each iteration `t`: positive regrets × `t^1.5/(t^1.5+1)`, negative × 0.5, strategy sum × `(t/(t+1))^2`. Chance: for each of the 48 river cards not on the board, the opponent reach is masked by `card_filter`, the child is evaluated on the 5-card board, and the traverser's values are summed with weight `1/44`; combos holding the river card get 0 from that branch. Rankings for the 48 river boards are built once in `new`. `Showdown { river: false }` on a turn tree is the average over the 48 river cards of the river showdown, weight `1/44`.

- [ ] **Step 1: Write the failing tests**:
  - `uniform_before_running`: fresh solver, `strategy(0, None, hole)` is uniform; and for a combo with zero range weight after 50 iterations still sums to 1 with no NaN.
  - `polarised_river_matches_the_equilibrium`: board `"2c 3d 7h 8s Ks"`, root `pot: 200, behind: 200, big_blind: 20` (a pot bet is all-in), river sizes `bets: [1.0]`, `raises: []`, `max_aggressive: 1`. Seat 1 (to act): value `7c7d 7c7s 7d7s` weight 1 each, air the 16 `5x4x` combos weight `3/16` each (value and air both total 3). Seat 0: the 12 bluff catchers `Kx Qy` with `x` in `c d h`, weight 1. No card is shared between the ranges. After 2000 iterations: the share of air in seat 1's betting weight is within 0.03 of `1/3`, and seat 0's call frequency facing the bet (weighted over its range) is within 0.03 of `0.5`.
  - `river_exploitability_falls_below_half_a_percent`: random ranges (`Rng::new(5)`, weights in `[0,1)`) on `"Ah 9c 6d 4s 2h"`, root `pot 400, behind 1800`, default sizes; exploitability after 300 iterations `< 0.005 * 400`.
  - `turn_exploitability_falls_with_iterations`: uniform ranges on `"Ah 9c 6d 4s"`, `pot 400, behind 1800`; `e10 > e50 > e200` and `e200 < 0.01 * 400`. Mark it `#[ignore]` if it takes over 10 s in debug, with a smaller always-on variant (`behind 300`) that checks `e5 > e40`.
  - `ranges_at_follows_the_strategy`: on the polarised spot, `ranges_at(child of the bet)` for seat 1 equals the root range times the bet probability per combo.
- [ ] **Step 2: Run** `cargo test -p mallorca-core subgame::solver` — expected: FAIL.
- [ ] **Step 3: Implement** `Solver`. Keep traversal functions under about 60 lines each: decision, chance, terminal.
- [ ] **Step 4: Run** `cargo test -p mallorca-core subgame` and `cargo test --release -p mallorca-core subgame -- --include-ignored` — expected: PASS. Note in the report how long a 100-iteration turn solve with uniform ranges and default sizes takes in release.
- [ ] **Step 5: Commit** `feat(solver): vectorised DCFR subgame solver`.

### Task 5: Range tracking in the bot

**Files:**
- Create: `solver/crates/core/src/bot/ranges.rs`
- Modify: `solver/crates/core/src/bot/mod.rs`, `solver/crates/core/src/bot/tests.rs`

**Interfaces:**
- Consumes: `subgame::range::Range`, `subgame::combos::combo_cards`, `Model` (`file.probabilities`, `abstraction.bucket`).
- Produces: `pub(crate) fn blueprint_update(model: &Model, range: &mut Range, node: NodeId, action: usize, street: Street, board: &[Card])` (for each positive combo not touching the board: `w *= max(p, 1) / 255` with `p = probabilities(node, bucket(street, combo, board))[action]`); `Bot::ranges(&self) -> Option<&[Range; 2]>` (by seat), reset to `Range::uniform()` on `hand_started`, masked with the board on `street`, updated in `acted` when the cursor follows the move on preflop or flop (no update when the cursor does not follow), and passed through `or_uniform` after each update.

- [ ] **Step 1: Write the failing tests** in `bot/tests.rs`:
  - `ranges_start_uniform`: after `hand_started`, both ranges are `Range::uniform()`.
  - `a_preflop_raise_reweights_the_raiser`: the opponent raises to 50 on the root; the opponent seat's weight for each combo equals `max(p, 1)/255` where `p` is the root probability of `RaiseTo(50)` for that combo's preflop bucket; hero's range is unchanged.
  - `own_actions_reweight_our_range`: hero decides and acts; hero's range changes the same way.
  - `the_board_zeroes_dead_combos`: after `street` with a flop, combos touching the flop weigh 0 in both ranges.
  - `ranges_never_empty`: weights that would all become 0 reset to uniform without the board.
- [ ] **Step 2: Run** `cargo test -p mallorca-core bot` — expected: FAIL.
- [ ] **Step 3: Implement**; the update runs in `acted` before `hand.node = next`, with the action index of `next` in the node's action list.
- [ ] **Step 4: Run** `cargo test -p mallorca-core` — expected: PASS (the existing bot tests still pass).
- [ ] **Step 5: Commit** `feat(solver): the bot tracks both ranges over the blueprint`.

### Task 6: The bot solves the turn and river

**Files:**
- Create: `solver/crates/core/src/bot/solve.rs`
- Modify: `solver/crates/core/src/bot/mod.rs`, `solver/crates/core/src/bot/tests.rs`

**Interfaces:**
- Consumes: Tasks 1 to 5.
- Produces: `#[derive(Clone, Copy, Debug, PartialEq, Eq)] pub struct SolverConfig { pub turn_iterations: u32, pub river_iterations: u32 }`; `Bot::with_solver(config: SolverConfig) -> Bot`; `Bot::set_solver(&mut self, config: Option<SolverConfig>)`; `Bot::last_evs(&self) -> Option<&[f32]>` (EV per action of the last solved decision, in the order of the solved node's actions). A config with both counts 0 means off.
- Behaviour:
  - On `street` to turn or river: record `Root { street, pot: committed[0] + committed[1], behind: min of both players' stack behind, big_blind: real big blind }`, clear the street path, and compute the street-start ranges: turn from the tracked ranges; river from the kept turn solve's `ranges_at(node_at(turn path), None)` when the path is in it, else the tracked ranges; both masked by the new board and passed through `or_uniform`. Drop the previous solve.
  - In `acted` on turn or river: append the real move to the street path as `SubAction` (`Move::Call` facing nothing is `Check`; `RaiseTo(to)` is the street total).
  - In `decide` on turn or river with the solver on and hole cards known: if there is no solve for this street or `node_at(path)` is `None`, build `SubTree::build(root, &Sizes::default(), &path)`, `Solver::new` with the street-start ranges, and `run` the street's iteration count. If the node is a decision of the hero's seat, sample the action with `strategy(node, None, hole)` and the draw, keep `action_evs`, and map it to a `Move` clamped to `Legal` (fold only when `legal.fold` and no free check; `RaiseTo` clamped to `legal.raise`, or the passive move when no raise is legal). Otherwise fall back to the blueprint decision. The blueprint cursor keeps moving on every street as before.
  - Without the solver the bot behaves exactly as before.

- [ ] **Step 1: Write the failing tests** in `bot/tests.rs`:
  - `random_hands_with_the_solver_get_legal_moves`: the existing random-hands property test run with `Bot::with_solver(SolverConfig { turn_iterations: 4, river_iterations: 8 })` over 60 hands at blinds 10/20 and 50/100 and stacks 400 to 30000; every move legal.
  - `a_turn_decision_goes_through_the_solver`: play a fixed hand to the turn (check down preflop and flop by both players), call `decide` on the turn; `last_evs()` is `Some` with one value per action of the solved root.
  - `an_off_tree_turn_bet_is_answered_legally`: the opponent bets 20 (1 bb) into the turn pot; the bot's answer is legal and `last_evs()` has an entry for fold, call and at least one raise.
  - `a_short_stack_turn_still_answers`: stacks so that 3 bb are behind on the turn; the opponent jams; the answer is fold or call.
  - `no_solver_means_no_evs`: a default `Bot::new()` on the same turn spot gives `last_evs() == None` and the same move as before the change for a fixed draw.
- [ ] **Step 2: Run** `cargo test -p mallorca-core bot` — expected: FAIL.
- [ ] **Step 3: Implement** in `bot/solve.rs` (street state, path, solve cache, move mapping), keeping `bot/mod.rs` to the hooks.
- [ ] **Step 4: Run** `cargo test -p mallorca-core` and the wasm build — expected: PASS.
- [ ] **Step 5: Commit** `feat(solver): the bot solves the turn and river`.

### Task 7: WASM export and web plumbing

**Files:**
- Modify: `solver/crates/wasm/src/lib.rs`, `solver/crates/wasm/src/tests.rs`, `web/src/cfr/model.ts`, `web/src/cfr/brain.ts`, `web/src/cfr/index.ts`, `web/src/cfr/cfr.test.ts`, `web/tools/arena/bots.ts`, `web/tools/arena/cfr.test.ts`, `web/tools/arena/cli.ts` (bot list in help or validation, if it enumerates names), `web/tools/arena/README.md` (flag list)

**Interfaces:**
- Consumes: `Bot::set_solver`, `SolverConfig` from Task 6.
- Produces:
  - WASM: `#[no_mangle] pub extern "C" fn bot_solver(bot: i32, turn_iterations: u32, river_iterations: u32)`.
  - TS: `export interface SolverOptions { turn: number; river: number }`, `export interface BotOptions { solver?: SolverOptions }`; `CfrModel.newBot(options?: BotOptions): CfrBot`; `createCfrBrain(model: CfrModel, rng: Rng, options?: BotOptions): CfrBrain`; `export const ARENA_SOLVER: SolverOptions` in `web/tools/arena/bots.ts`; arena bot name `'cfr-solve'` in `BOTS` and in `prepareBots`.

- [ ] **Step 1: Write the failing tests**:
  - Rust `bot_solver_turns_the_solver_on`: with the test play file, a bot with `bot_solver(b, 4, 8)` plays a scripted hand to the turn and `decide` returns a legal kind.
  - Vitest in `src/cfr/cfr.test.ts`: `newBot({ solver: { turn: 4, river: 8 } })` plays a scripted hand to the river and returns legal actions.
  - Vitest in `tools/arena/cfr.test.ts`: `playPair(BOTS['cfr-solve'], BOTS.cfr, 3, 1)` is reproducible, after `prepareBots(['cfr-solve'])`.
- [ ] **Step 2: Run** `cargo test -p mallorca-wasm` and `npm test -- cfr` in `web/` — expected: FAIL.
- [ ] **Step 3: Implement**; `ARENA_SOLVER` starts at `{ turn: 100, river: 200 }` and is set in Task 8 by measurement.
- [ ] **Step 4: Run** `cargo test -p mallorca-wasm`, `npm run lint`, `npx tsc --noEmit`, `npm test` — expected: PASS.
- [ ] **Step 5: Commit** `feat(cfr): solver option for the CFR bot and a cfr-solve arena bot`.

### Task 8: Iteration counts and the browser opponent

**Files:**
- Modify: `web/tools/arena/bots.ts` (`ARENA_SOLVER`), the game worker that creates the CFR brain (find it with `grep -rn createCfrBrain web/src/game`), `web/e2e/solver.spec.ts`

**Interfaces:**
- Consumes: Task 7.
- Produces: `export const BROWSER_SOLVER: SolverOptions` in `web/src/cfr/index.ts` used by the game for the Solver opponent.

- [ ] **Step 1: Measure** time per turn and river decision in Node through the WASM module (a throwaway script under `/tmp`, not committed): 200 random turn spots and 200 river spots with `turn` in `{50, 100, 200}` and `river` in `{100, 200, 400}`. Pick the largest counts whose p95 decision time is under 1.0 s (so a 4x slower phone stays under 4 s, inside the 5 s budget). Use the same counts for `ARENA_SOLVER` and `BROWSER_SOLVER`; record the measurement in the task report.
- [ ] **Step 2: Write the failing e2e test** in `web/e2e/solver.spec.ts`: `the solver decides within the budget under a 4x CPU throttle`: open a CDP session (`page.context().newCDPSession(page)`), `Emulation.setCPUThrottlingRate` with `{ rate: 4 }`, choose the Solver opponent, play passive until 3 hands are done, and assert every bot decision took under 5000 ms, measured from the moment the hero acts to the moment the bot's action shows (use the existing waypoint helpers; follow the file's style).
- [ ] **Step 3: Implement**: the game passes `{ solver: BROWSER_SOLVER }` to `createCfrBrain` for the Solver opponent.
- [ ] **Step 4: Run** `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run test:e2e` — expected: PASS.
- [ ] **Step 5: Commit** `feat(game): the Solver opponent solves the turn and river`.

### Task 9: Arena results and docs (controller)

- [ ] Run `npm run arena -- --a cfr-solve --b cfr --pairs 20000 --seed 4` and `--b math --pairs 20000 --seed 4` (background; each may take an hour).
- [ ] Record both rows in `solver/RESULTS.md` (a new section "Turn and river solver") and `web/tools/arena/README.md`; update `ARCHITECTURE.md` and `solver/README.md` where they describe the CFR bot's streets.
- [ ] Commit `docs: turn and river solver results`, push, open the PR.
