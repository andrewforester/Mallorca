# Turn and river subgame solver

Issue #16, phase 1. #13 plays the `v1` blueprint on every street. This replaces the blueprint on the turn and river
with a strategy solved at play time for the real board, pot, stacks and bet sizes. The owner was away when this
was written and asked for autonomous work; the decisions below were taken without review and are listed in the PR.

## Goal and success

- `npm run arena -- --a cfr-solve --b cfr` and `--b math` print bb/100 with a 95% interval; both results go into
  `solver/RESULTS.md` and `web/tools/arena/README.md`.
- Success: `cfr-solve` beats `cfr` with the interval above zero, and beats `math` by more than #13's
  +32.8 ± 9.2 bb/100.
- The browser's Solver opponent uses the subgame solver, and a decision stays within the 5 s budget under a 4x CPU
  throttle in an e2e test.

## Decisions

1. **Where.** A new module `mallorca-core::subgame`, pure (no time, no files, no global RNG), built for wasm32.
   Submodules:
   - `combos`: the 1326 two-card combos, index `i < j` in a fixed order, card masks.
   - `range`: `Range`, a weight per combo; zeroes combos that touch the board; Bayes update by a probability per
     combo.
   - `tree`: the subgame tree in real chips.
   - `showdown`: vectorised terminal values with card removal.
   - `solver`: vectorised DCFR, the average strategy, exploitability, EV per action at a node.
2. **Root at the start of the current street.** Every solve starts at the first decision of the current street
   (turn: turn and river with the 48 river cards as a chance node; river: the river only). The actions already
   taken on this street are inserted into the tree with their real sizes, so the solve's own equilibrium gives the
   ranges at the current node. Ranges at the street start come from Bayes:
   - preflop and flop: the blueprint's probability of the action each player took, per combo, through that
     combo's bucket (preflop: the hole class; flop: the flop table). Quantised probabilities are floored at
     `1/255` so a range never empties by rounding. Our own range is updated the same way: the solver needs our
     whole range, not only our hand. An action the cursor could not follow (a resync) leaves both ranges as they
     are;
   - turn to river: the turn solve's average strategy along the real turn path. If the path is not in the last
     turn solve, the ranges stay as they were at the turn start.
3. **Re-solve only when needed.** A solve is kept for the rest of its street. At each of our decisions the real
   street path is looked up in it; it is solved again, from the street start with the new path inserted, only if
   the path is missing (an opponent size that is not in the tree). On-tree play costs one solve per street.
4. **Bet sizes**, as pot fractions after the call, in a `SizeConfig`:
   - turn: bet 0.5, 1.0; raise 1.0; all-in always; at most 3 aggressive actions per street;
   - river: bet 0.5, 1.0; raise 1.0; all-in always; at most 3;
   - a size above 2/3 of the stack behind becomes all-in; a size below the legal minimum becomes the minimum;
     duplicates are merged. Minimum bet one big blind; minimum raise increment the last increment, at least one big
     blind. Stacks are the effective stack (the smaller behind). The real path's sizes are added where they occur.
5. **Algorithm.** DCFR (alpha 1.5, beta 0, gamma 2), alternating updates, vectorised over combos, regrets and
   strategy sums in `f32`. Terminal values in O(n) per node after a per-board sort of combo ranks, with the
   per-card sums of inclusion-exclusion for card removal. River chance: each live river card weighted `1/44`
   (52 minus the board and both hands), opponent combos that hold the card masked. Iterations are a count, not a
   time, so arena runs stay reproducible by seed; the browser picks counts that fit the budget.
6. **Safety.** Phase 1 uses unsafe re-solving (Bayes ranges, no gadget). A safe gadget needs the blueprint's
   counterfactual values for every opponent combo at the root, which needs turn and river buckets for every combo
   and every runout; it is left for a later step. The arena against `cfr` is the check that it does not lose
   value.
7. **Bot integration.** `bot::Bot` keeps its blueprint cursor on every street (it still plays preflop and flop and
   is the fallback). `Bot::with_solver(SolverConfig { turn_iterations, river_iterations })` turns the subgame
   solver on for turn and river. The bot tracks both ranges, the street-start pot and stacks and the real actions
   of the current street. The solved action maps to a real `Move` directly (the tree is in real chips), clamped to
   `Legal`; fold never when a check is free.
8. **EV per action.** `solver` returns, for our combo at the current node, the EV of each action under the average
   strategy, in chips. The bot keeps it for the last decision; the WASM ABI exposes it later for the coach (#5).
9. **WASM.** One new export, `bot_solver(bot, turn_iterations, river_iterations)`; zero turns it off.
10. **Web.** `CfrModel.newBot(options?)` takes `{ solver?: { turn: number; river: number } }`; `createCfrBrain`
    passes it through. Arena: a new bot `cfr-solve`; `cfr` stays the blueprint alone. Game: the Solver opponent uses
    the subgame solver with the counts measured to fit the budget.

## Testing

- `combos`, `range`: index round trip, board masking, Bayes update.
- `tree`: legal sizes, all-in threshold, minimum raise, path insertion, chance node on the turn.
- `showdown`: fold and showdown values against a brute-force double loop on random ranges and boards.
- `solver`: on a river toy spot (a polarised range of nuts and air against a bluff catcher, one pot-sized bet) the
  average strategy is within 0.03 of the equilibrium (bluff share 1/3 of bets, call 1/2); exploitability on a turn
  spot falls as iterations grow and ends below 1% of the pot; a river spot reaches below 0.5% of the pot.
- `bot`: the random-hands property test runs with the solver on (small iteration counts) and sees only legal
  actions; the bot answers a turn decision through the solver.
- Web: `cfr-solve` in the arena tests, `newBot` options, the e2e decision time under 4x throttle.

## Out of scope

The depth-limited flop (phase 2), the safe gadget, LBR of the solving bot (LBR plays the tree, the solver plays
outside it), the coach UI for EV, bucket fixes of #17.
