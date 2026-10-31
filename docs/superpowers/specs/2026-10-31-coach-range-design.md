# Coach phase 1: the bot's range and the player's equity

Issue #5, phase 1. The coach panel shows a 13x13 heatmap of the bot's range and the player's equity against it, in
every spot, on phone and desktop, computed off the main thread.

## Decision: the range comes from the CFR strategy

The issue proposed `Spectrum` and `VillainSpectrumTracker`. They model the opponent as the Java `RandomBot`, whose
action probabilities do not depend on the cards, so Bayes multiplies every hand by the same factor and the heatmap
stays flat apart from card removal. The owner chose the exact range instead: the bot is our own CFR bot, so the
probability of each action for every hole-card pair is in the strategy file.

- Opponents `cfr` and `cfr-v2`: exact range, narrowed by each bot action.
- Opponent `math`: no range model. The panel shows equity against a random hand and no heatmap, with a line that says
  why.

## Range in Rust (`mallorca-core::bot`)

The bot already knows, at every decision, the tree node it sampled from and the tree action it chose. The range is
the bot's own range as the player sees it: every hole-card pair the bot could hold, weighted by the probability that
the bot's strategy took the actions it took.

- `Bot` keeps `history: Vec<Step>`, one `Step { node, action, street, board }` per decision that sampled the
  strategy. A decision that plays the passive action without sampling (no node, shifted resync, unknown hole cards)
  adds no step: the action did not depend on the cards. The resync draw does not depend on the cards either, so it
  cancels out of Bayes.
- `Range::of(model, history, board)` returns 1326 weights indexed by the pair index of `(a, b)`, `a < b`. It starts
  at 1, sets 0 for pairs that touch the board, and multiplies each pair by `p(action | node, bucket(pair))`, with
  `p` the quantized byte over the sum of the node's bytes. Pairs are grouped by bucket, so each step reads the
  strategy once per bucket.
- Bucketing every pair is the cost. Flop buckets are a table lookup. Live turn and river buckets reuse one
  computation per board instead of one per pair: the river strength of every pair on a five-card board is one sort of
  the 1081 live pairs (`river_strength`), and the turn value or histogram aggregates the 46 river boards. Target:
  under 150 ms for a full river range in release WASM on a desktop, checked by an ignored release test.
- The player's hole cards are unknown to the bot; the TS side zeroes the pairs that touch them.

WASM ABI: `bot_range(bot) -> *const f32`, a pointer to 1326 `f32` in a buffer owned by the seat, valid until the next
call on that seat. `abi.test.ts` pins it like the other exports.

## TS layers

A new layer `coach/` between `brains`/`cfr` and `game`.

| Layer   | May import from                                     |
| ------- | --------------------------------------------------- |
| `coach` | `cards`, `equity`, `brains`, types from `cfr`       |
| `game`  | adds `coach`                                        |

- `coach/grid.ts`: `toGrid(weights)` folds 1326 weights into 169 cells (row and column by rank, pairs on the
  diagonal, suited above it), each cell the mean weight of its live combos and the share of the range it holds.
- `coach/equity.ts`: `equityVsRange(hero, board, weights)`. Postflop it builds a `Spectrum` and calls
  `SpectrumEquilator`; preflop it sums the 169x169 preflop table over the weighted classes.
- `coach/odds.ts`: pot odds and the price of the call from the view of the player: `toCall / (pot + toCall)`, and the
  equity needed to call.
- `CoachFacts`: `{ grid | null, equity, potOdds | null, toCall }`.

## Where it runs

The bot worker already holds the model and the bot whose history is the range. It is idle while the player acts.

- New request `{ kind: 'coach'; id; hero; board }`, reply `{ id; facts: CoachFacts }`. The worker reads the range
  from the cfr brain (`CfrBrain.range()`), zeroes the player's cards, computes the grid and the equity and replies.
  For `math` it replies with a uniform range and no grid.
- `BotClient.coach?(hero, board)`; `withFallback` and `inProcessBot` answer the uniform facts.
- The session asks for facts when the phase becomes `humanToAct` and stores them as `coach` in `SessionState`; a
  reply for an older step is dropped, like a late decision.

## UI

`Coach` renders into the existing `coach` slot: the equity, pot odds and price of the call on one line, the 13x13
grid below, cell opacity by weight. Landscape: the side panel. Portrait: a toggle in the status bar opens it as a
sheet, like the hand log. A preference `mallorca.coach` turns it on or off; off by default so the game stays a game.
Strings go to `en.json`; tokens to `tokens.css`.

## Tests

- Rust: the range of a hand where the bot only checks is unchanged; after a bet the pairs with a higher bet
  probability gain weight; board pairs are 0; the per-bucket grouping equals a per-pair reference.
- TS: `toGrid` sums, `equityVsRange` against a one-hand range equals the head-to-head equity, the worker handler
  answers `coach`, the session drops stale facts, `Coach` renders the grid.
- e2e: the coach panel shows a grid with the `cfr` opponent on phone and desktop. Contact sheets after the UI change.

## Out of scope

Hints, EV and hand review (phase 2), the LLM and server storage (phase 3), a range for the math bot.
