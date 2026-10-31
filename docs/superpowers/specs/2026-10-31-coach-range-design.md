# Coach mode, first version

Issue #5. A training mode on the same table: the coach shows what the CFR strategy would do with the player's hand,
the bot's range narrowed by its actions, the numbers of the spot, and after each hand a review of the player's
decisions and the leaks of the session. It covers phase 1 and the strategy part of phase 2; EV per action, the EV
lost in the review and the LLM explanations come later.

## Scope

In the spot, while the player is to act:

1. **Move hint**: the strategy's distribution over actions for the player's hand ("check 60%, bet half pot 30%,
   bet pot 10%"), with a sentence of its own for a mixed strategy.
2. **Strategy grid**: 13x13, what the strategy does with every hand from the player's seat in this spot, each cell
   split into action colours by frequency.
3. **Bot range grid**: 13x13, the bot's range narrowed by Bayes over its actions.
4. **Numbers**: equity against the bot's range, pot odds, the equity a call needs, the minimum defence frequency
   facing a bet, and the bluff share a bet of that size implies.
5. **Range composition**: the bot's range split by made hand and draw on this board (sets and better, two pair,
   top pair, other pairs, draws, air), and the share of it the player is ahead of.
6. **Outs**: the cards that improve the player to a hand ahead of most of the range, and the chance to hit by the
   next card and by the river.
7. **Blockers**: how much of the bot's strong part (two pair and better, its nut draws) the player's cards remove.

After the hand and over the session:

8. **Hand review**: every decision of the player beside the strategy's distribution in that spot, marked as a
   strategy action (frequency at least 25 %), a rare one (5 to 25 %) or off-strategy (under 5 %).
9. **Leaks**: the session's frequencies against the strategy's in the same spots: preflop open, 3-bet and fold to
   3-bet, flop c-bet and fold to c-bet, turn and river aggression, fold facing a river bet. Shown with the number
   of spots, and only once a line has at least 10.

Not in this version: EV per action and EV lost, quiz mode, preflop charts, LLM explanations, a range or hints for
the math bot.

## Mode

A coach switch on the start screen and in the menu (`mallorca.coach`, off by default). Off, the table is the game
as today. On, the coach panel opens and the review follows each hand. The coach needs a CFR strategy: with the
`math` opponent the switch also loads `cfr` into a coach engine (below), and the bot range and composition are
hidden, since the math bot's play does not come from the strategy; the hint, the strategy grid and the numbers
against a random hand remain.

## The strategy from both seats

The strategy file holds, for every decision node and bucket, the probability of each tree action, for both seats.
The coach reads it in two ways.

- **Hint and strategy grid**: a coach `Bot` sits in the player's seat and follows the hand exactly as the bot does
  for its own seat (the same tree walk, off-tree mapping and resync). At the player's turn it returns the node and,
  for every hole-card pair, the action probabilities of its bucket.
- **Bot range**: the playing bot records each decision that sampled the strategy as
  `Step { node, action, street, board }`. A decision that plays the passive action without sampling adds no step:
  it did not depend on the cards, and the resync draw does not either, so both cancel out of Bayes. The range is
  1326 weights, 1 at the start, 0 for pairs that touch the board, each multiplied by `p(action | node, bucket)` of
  every step, `p` the quantized byte over the node's byte sum. With the `math` opponent there is no playing CFR
  bot and no range.

Bucketing all 1326 pairs is the cost. Pairs are grouped by bucket so each step reads the strategy once per bucket.
Flop buckets are a table lookup; live turn and river buckets reuse one computation per board instead of one per
pair (the river strength of every pair on a five-card board is one sort of the live pairs, the turn value or
histogram aggregates the river boards). Target: a full river grid and range under 150 ms in release WASM on a
desktop, held by an ignored release test.

When the hand is off the tree (an off-tree size mapped to a neighbour, a resync), the hint is approximate and the
panel says so.

## Rust (`mallorca-core::bot`, `mallorca-wasm`)

- `Bot::history()` and `range(model, board) -> [f32; 1326]`, indexed by the pair index of `(a, b)`, `a < b`.
- `Bot::spot(model, legal) -> Option<SpotView>`: the node the bot would decide at (the same validity and resync as
  `decide`, without sampling or moving) and its action labels (`fold`, `check`, `call`, raise as a pot fraction,
  all-in).
- `strategy_grid(model, spot, board) -> Vec<f32>`: 1326 rows of action probabilities.
- WASM: `bot_range`, `bot_spot`, `bot_spot_grid`, each writing into a buffer owned by the seat and returning its
  pointer, valid until the next call on that seat. `abi.test.ts` pins them.

## TS

A new layer `coach/` between `brains`/`cfr` and `game`.

| Layer   | May import from                               |
| ------- | --------------------------------------------- |
| `coach` | `cards`, `equity`, `brains`, types from `cfr` |
| `game`  | adds `coach`                                  |

- `grid.ts`: folds 1326 values into 169 cells (rows and columns by rank, pairs on the diagonal, suited above it).
- `equity.ts`: equity against a weighted range: postflop through `Spectrum` and `SpectrumEquilator`, preflop from
  the 169x169 preflop table.
- `odds.ts`: pot odds, required equity, MDF and the implied bluff share of a bet.
- `composition.ts`, `outs.ts`, `blockers.ts`: items 5 to 7 from the range, the board and the hand evaluator.
- `review.ts`: grades each player decision against the hint of that spot (item 8).
- `leaks.ts`: counts the spots of item 9 over the session's hands and the strategy's frequency in the same spots.
- `CoachFacts`: everything the panel shows for one spot, plain data.

## Where it runs

The bot worker holds the model and the playing bot, and is idle while the player acts. The coach `Bot` lives there
too, fed the same observations from the player's side.

- `WorkerRequest` gains `{ kind: 'coach'; id; hero; board; legal }`, reply `{ id; facts: CoachFacts }`.
- `BotClient.coach?(...)`; `withFallback` and `inProcessBot` answer no facts, and the panel shows that the coach is
  unavailable.
- The session asks for facts when the phase becomes `humanToAct` and keeps them as `coach`; a reply for an older
  step is dropped, like a late decision. Each player decision stores its hint in the hand record (`coachHint`), so
  the review and the leaks read the records and the export carries them.

## UI

- `Coach` in the existing `coach` slot: the hint line on top, then tabs **Hint** (strategy grid), **Range** (bot
  range grid and composition) and **Numbers** (equity, odds, MDF, outs, blockers). Landscape: the side panel.
  Portrait: a status bar toggle opens it as a sheet, like the hand log.
- `HandReview` after each hand in coach mode: one row per player decision, its grade and the strategy's
  distribution. `Leaks` in the session-over dialog and in the menu.
- Strings in `en.json`, colours of the action classes as tokens in `tokens.css`, in light and dark themes.

## Tests

- Rust: a check-only line leaves the range unchanged; after a bet, pairs with a higher bet probability gain weight;
  board pairs are 0; per-bucket grouping equals a per-pair reference; `spot` matches the node `decide` samples from.
- TS: grid folding, equity against a one-hand range equals the head-to-head equity, odds formulas, composition on
  fixed boards, outs, blockers, review grading, leak counting, the worker handler answers `coach`, the session drops
  stale facts, the components render.
- e2e: in coach mode with `cfr`, the panel shows the hint and both grids on phone and desktop, the review appears
  after a hand. Contact sheets after the UI change.

## Delivery

Four pull requests, each usable on its own:

1. Rust: range, spot and strategy grid, the WASM ABI.
2. `coach/` layer and the worker request: hint, grids and numbers in the panel, coach switch.
3. Range composition, outs and blockers.
4. Hand review, coach hints in the records, leaks.
