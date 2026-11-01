# Architecture

One repository, two parts. The root holds the Java heads-up poker bot as an archive: it is not modified and it is
the reference the TypeScript port is checked against. `web/` is the browser game: a heads-up No-Limit Hold'em
cash game or tournament against a TypeScript port of the Mallorca math bot or the CFR blueprint trained in
`solver/`, built as a static site.

## Repository layout

| Path                                                                | Owns                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `MallorcaBrains/`, `MallorcaCore/`, `MallorcaEquilator/`, `Tools/`  | Java bot, game model and equilator; the source of the golden fixtures              |
| Other Gradle modules (`MallorcaUI/`, `PokerRobot/`, `HHParser/`, …) | Java archive, not used by `web/`                                                   |
| `web/src/`                                                          | The game, in layers (see "Layers")                                                 |
| `web/src/locales/en.json`                                           | Every string the UI shows                                                          |
| `web/e2e/`                                                          | Playwright tests and the contact sheet script                                      |
| `web/scripts/preflop-table.ts`                                      | Regenerates `src/brains/data/preflop-strength.json`                                |
| `web/tools/golden/`                                                 | JVM harness that writes the golden fixtures, see its `README.md`                   |
| `web/tools/evaluator-golden/`                                       | Writes the evaluator fixture of `solver/crates/core`, see its `README.md`          |
| `web/tools/arena/`                                                  | Node duplicate matches between two bots and their viewer, see "arena"              |
| `web/arena-results/`                                                | Published arena runs served at `/arena/`, see "arena"                              |
| `web/prototypes/emotion-lab/`                                       | Emotion sandbox: the `emotion` engine with a face and a voice, see `docs/emotion`  |
| `web/public/avatar/`                                                | Her 3D model `mallorca.glb`, its still `portrait.webp` and `LICENSE.md` (MIT)      |
| `web/tools/avatar/`                                                 | Blender script that converts the Rocketbox source into `mallorca.glb`, see README  |
| `docs/emotion/`                                                     | Emotion model document, its screenshots and generated tables                       |
| `web/scripts/wasm.ts`                                               | Builds `solver/crates/wasm` and copies it to `src/cfr/mallorca.wasm`               |
| `solver/`                                                           | Rust CFR trainer and the `mallorca-wasm` module, see its `README.md`               |
| `supabase/`                                                         | Table talk server: schema, limits and the `talk` Edge Function                     |
| `.github/workflows/`                                                | `web-ci.yml`, `talk-ci.yml` on PRs; `web-deploy.yml`, `web-vercel.yml` on `master` |

Generated and never committed: `web/dist`, `web/test-results`, `web/playwright-report`, `web/e2e/contact/`,
`web/tools/golden/build`, `web/arena-out/` (the arena results, see "arena") and `web/src/cfr/mallorca.wasm`, which
`npm run wasm` builds with cargo (the toolchain pinned in `solver/`) before `dev`, `test`, `build` and `arena`.

`tsc` (`web/tsconfig.json`) type-checks `src`, `scripts`, `e2e`, `playwright.config.ts`, `tools/arena`,
`tools/evaluator-golden` and `prototypes`.

## Stack

Node 24, Vite, TypeScript strict, Preact, zustand, i18next, Vitest with `fast-check`, Playwright, ESLint
(typescript-eslint, `eslint-plugin-import-x`) and Prettier. Hand evaluation is `phe`, behind the `HandEvaluator`
interface.

## Layers

```
web/src/
  cards/    Card, parse and format ("As Kd"), seeded RNG, shuffle
  equity/   hand evaluation, equity against a hand or a range, and the equity types
  engine/   heads-up NLHE rules as a pure reducer, table with a mode and its rules, hand history
  brains/   port of the Mallorca math bot
  cfr/      the CFR bot: the WASM module, the strategy file and a Brain over them
  emotion/  the opponent's emotions: personality, appraisal, mood, overload and the play bias they give
  face/     her face and voice as numbers: expression, poker face, reactions, idle tells, visemes, prosody
  conversation/     table talk: hand-strength class, tells, mood and the bias it maps to
  coach/    the coach's facts: hint, strategy and range grids, equity, odds
  game/     session store, turn loop, bot worker client, view-model, hand records
  ui/       Preact components, layout, tokens, i18n
```

| Layer          | May import from                                                               |
| -------------- | ----------------------------------------------------------------------------- |
| `cards`        | nothing                                                                       |
| `equity`       | `cards`                                                                       |
| `engine`       | `cards`, `equity`                                                             |
| `brains`       | `cards`, `equity`, `engine`                                                   |
| `cfr`          | `cards`, types from `engine`, `brains`                                        |
| `emotion`      | nothing                                                                       |
| `face`         | `emotion`                                                                     |
| `conversation` | `cards`, `equity`, `emotion`, types from `engine`                             |
| `coach`        | `cards`, `equity`, `brains`, types from `engine`, `cfr`                       |
| `game`         | `cards`, `equity`, `engine`, `brains`, `cfr`, `conversation`, `coach`, `face` |
| `ui`           | `game`                                                                        |

`brains` takes only types from `engine`: `Action`, `LegalActions`, the events it turns into observations and
`BoardSize`, which pins its board sizes to the engine's.
`ui` imports only from `game`; for the table, `game` re-exports `Card`, `formatCard`, `rankOf`, `SeatIndex`,
`LogEntry`, `HandCategory`, `TableMode`, `CASH` and `TOURNAMENT`, for the opponent choice `Opponent` and
`opponentsFor`, for the history `HandRecord`, `HandStore`, `openHandStore`, `memoryStore` and
`toPokerStars`, and for the emotion debug panel `toDebugView`, `DebugView` and its parts, `PERSONALITIES`,
`PersonalityKey`, `Personality`, `EMOTIONS`, `Emotion`, `BIAS_KEYS` and `LOAD_SOURCES`.

Each layer's `index.ts` exports only what other layers and `tools/` import; a test reaches the internals of its
own layer by path. `brains/index.ts` holds `Brain`, `Decision`, `Observation`, `createMathBrain`,
`toObservations` and, for `coach`, `Spectrum`, `HoleCards`, `SpectrumEquilator` and `preflopStrengthVsSpectrum`; `engine/index.ts` the types of a hand and a table, the reducers (`startHandWith`, `applyAction`,
`startHand`, `apply`, `legalActionsOf`, `toAct`), `isLegal`, `checkOrCall`, `playToEnd`, `createTable`, `rulesOf`,
the modes, `startingStack`, `BOARD_SIZE` and `handHistory`; `cfr/index.ts` `createCfrBrain`, `CfrModel`,
`loadCfrModel`, `SHIPPED_STRATEGIES`, `ShippedStrategyKey` and `BotRecord`; `game/index.ts` is the surface of `ui`
(with `createSession`, `toViewModel`, `groupHand`, `workerBot` and `inProcessBot`).

ESLint enforces the table with a `@typescript-eslint/no-restricted-imports` rule per directory. For `brains` the
rule sets `allowTypeImports` on `engine`; the tests in `brains` and `conversation` (`*.test.ts`) may also import `engine` code to
build events. `src/main.tsx` may import only `game` and `ui`. `tools/arena/**` may import from `src` only `cards`,
`engine`, `brains`, `cfr`, `conversation` and `game/records`; the viewer `tools/arena/ui/**` (tests aside) only `game/records` and
types from `engine`; `tools/evaluator-golden/**` only `cards` and `equity`. `import-x/no-cycle` forbids import cycles inside `src`.

### Purity

`cards`, `equity`, `engine`, `brains`, `cfr`, `emotion`, `face`, `conversation` and `coach` use no DOM (`document`, `window`, `self`, `navigator`), no
`Math.random` or `crypto`, no `Date` or `performance`, no timers (`setTimeout`, `setInterval`), no `fetch` and no
storage (`localStorage`, `indexedDB`). ESLint enforces it with `no-restricted-globals` and
`no-restricted-properties`. Randomness enters as an `Rng` argument, bytes through a reader passed in; `cfr`'s
`inflate` uses `Blob`, `Response` and `DecompressionStream`, which stay allowed.

## cards

- `Card` is a number 0..51, `rank * 4 + suit`. `rankOf` returns 2..14, `suitOf` returns 0..3 for `c d h s`.
- `cardOf(rank, suit)`, `parseCard("As")`, `parseCards("As Kd")`, `formatCard`, `fullDeck()`.
- `Rng` has `next(): number` in [0, 1). `mulberry32(seed)` implements it. `shuffle(items, rng)` is Fisher-Yates
  and returns a copy.

## equity

- `HandEvaluator` has `rank(cards)` for 5 to 7 cards, higher is better, and `category(rank)`, a `HandCategory`:
  `high-card`, `pair`, `two-pair`, `trips`, `straight`, `flush`, `full-house`, `quads`, `straight-flush`.
  `pheEvaluator` implements it over `phe`.
- `WeightedHands` (hole cards with a weight) is the type `brains` computes equity with; the computation itself
  lives in `brains` (`spectrumEquilator.ts`, `preflopEquilator.ts`).
- `equityVsHand(hero, villain, board)` enumerates the rest of the board exactly; `equityVsRange(hero, range, board,
{ rng, samples })` is exact on the turn and the river and samples before that. `conversation` uses them for her strength
  class and her luck.
- `index.ts` exports `pheEvaluator`, `HandCategory`, `WeightedHands`, `EquityOptions`, `equityVsHand` and
  `equityVsRange`.
- `npm run bench` (`evaluator.bench.test.ts`, outside `npm test`) ranks one million seven-card hands and expects
  under 1500 ms outside CI.

## engine

- `createTable(names, mode, firstButton = 0)` (`table.ts`) returns a `Table`:
  `{ mode, seats, button, handNumber, hand, winner }`. A `Seat` is `{ name, stack }`. `TableMode` is
  `{ kind: 'tournament' }` (`TOURNAMENT`) or `{ kind: 'cash', bigBlind, buyIn }` (`CASH` is 20 and 2000). Both
  seats start with `startingStack(mode)`: `TOURNAMENT_STACK` (2000) in a tournament and `buyIn` in cash.
- `rulesOf(mode)` (`rules.ts`) returns the `Rules` of a mode: `blinds(handNumber)`, `beforeHand(seats)`, which
  returns the seats and events before the deal, and `isOver(seats)`, the winner or null. The table stays plain
  data; `startHand` and `apply` take the blinds, the top-up and the winner from the rules.
- `startHand(t, rng)` moves the button (the first hand uses `firstButton`, then it alternates), applies
  `beforeHand`, sets the blinds, shuffles and deals. `apply(t, action)` applies an `Action`: `fold`, `check`, `call` or `raise` with `to`.
  Both return `{ state, events }`. `legalActionsOf(t)` and `toAct(t)` read the current hand.
- `startHandWith(seats, { button, blinds, handNumber }, deck)`, `applyAction(hand, seats, action)` and
  `legalActions(hand, seats)` are the hand-level reducer; `applyAction` throws `IllegalActionError` for anything
  `legalActions` does not offer, as `isLegal(legal, action)` (`legal.ts`) decides. `checkOrCall(legal)` is the
  passive action.
- `playToEnd(start, act, onStep)` (`play.ts`) plays a hand from a `Step`: while a seat is to act it applies
  `act(seat, legal)` (an `Actor`) and calls `onStep` with the start and every later step, then returns the last.
  The arena and the cfr tests drive their bots through it.
- `startHandWith` takes an already shuffled deck and deals from its front. Hole cards alternate starting with the
  seat after the button: `deck[0]` and `deck[2]` go to the big blind seat, `deck[1]` and `deck[3]` to the button.
  The board follows in order with no burn cards: flop `deck[4..6]`, turn `deck[7]`, river `deck[8]`. `Hand.deck`
  holds the undealt cards.
- `Street` (`types.ts`) is the one list of street names; `BettingStreet` drops `showdown` and `complete`,
  `DealtStreet` also drops `preflop`, and every other street type in `src` and `tools/` derives from them.
  `BOARD_SIZE` (`streets.ts`) is the board length per betting street; it and its type `BoardSize` are exported.
- `Hand.bets` is the street bet per seat, `committed` the total per seat for the hand, `pot` is the sum of
  `committed`. `canRaise` is false for a seat that faces a short all-in raise.
- `seats` stacks are the chips behind. `LegalActions` is `{ fold, check, call, raise }`: `call` is the amount the
  call adds, `raise` amounts are "raise to" the street total and `max` is all-in. `legalActions` returns no action
  when nobody is to act.
- Events: `toppedUp`, `handStarted`, `blindPosted`, `holeCards`, `acted`, `streetDealt`, `showdown`, `betReturned`,
  `potAwarded`, `handEnded`, `tournamentEnded`. `acted.amount` is the chips added to the pot by that action.
  `toppedUp { seat, amount }` comes before `handStarted`, so `handStarted.stacks` include it; `toObservations`
  ignores it.
  `showdown.hands` is indexed by seat; `cards` are the hole cards. `streetDealt.pot` and `showdown.pot` are the
  pot of the matched chips when the street is dealt or the hands are shown, without an uncalled bet.
- When a hand ends, `street` is `complete`, `toAct` is null, `pot` is 0 and the stacks include the awarded pot.
- `startHand` and `apply` both end the tournament when a hand completes with an empty stack: they set `winner` and
  append `tournamentEnded`. A cash table never ends and never emits `tournamentEnded`. A hand can complete inside `startHand` when a short stack is all-in from the blinds.
- `handHistory(events)` returns `LogEntry` values, `{ key, params }`, with seat indices in `params.seat` and no
  names or English text. `key` is a locale key under `log` (with `you` or `other` for entries that have a seat);
  `params.category` is a `HandCategory`. The `flop`, `turn`, `river` and `show` entries carry `params.pot`.

### Rules

- The button posts the small blind and acts first preflop, last on later streets.
- The minimum raise is the last raise increment, at least the big blind. An all-in for less than a full raise does
  not reopen betting for a player who already acted; a full raise does.
- A bet larger than the opponent's stack is capped: the uncalled excess returns to its owner as `betReturned`,
  before `potAwarded`. `potAwarded` holds only the matched pot, twice the smaller contribution.
- A player who cannot cover a blind posts all-in for what they have. When both players are all-in, or one is
  all-in and the other has called, the board runs out to showdown with no betting.
- A tie splits the pot; the odd chip goes to the big blind.
- Starting stack 2000. `BIG_BLINDS` holds the big blind of each level:
  `20, 30, 40, 50, 60, 80, 100, 120, 160, 200, 240, 300, 400, 500, 600, 800, 1000, 1200, 1600, 2000, 2400`.
  The small blind is half, rounded down. `blindsFor(handNumber)` raises the level every 10 hands and holds the
  last level.
- The tournament ends when a stack reaches zero.
- Cash: fixed blinds of `bigBlind / 2` (rounded down) and `bigBlind`, 10/20 for `CASH`. Before each hand every
  seat below `buyIn` is topped up to exactly `buyIn` and the other keeps its chips, so the effective stack before
  every cash hand is at least, not exactly, 100 bb: 4000 against 2000 becomes 3500 against 2500 when the short
  seat wins a pot of 500 without being topped up.

Tests: `scenarios.test.ts` is the rule table, `properties.test.ts` holds the `fast-check` properties (chips are
conserved, every legal action is accepted, every random legal sequence ends the hand, awarded pots match what was
committed) and, for a cash table, that both stacks before every hand are at least `buyIn`, a topped-up seat holds
exactly `buyIn`, and chips are conserved once the top-ups are added).

## brains

A port of the MallorcaBrains math bot and the parts of MallorcaCore and MallorcaEquilator it uses. Preflop charts,
push/fold, neural opponent models, hand history parsers, the robot and the Swing UI are not ported.

| Module                 | Holds                                                                            |
| ---------------------- | -------------------------------------------------------------------------------- |
| `observation.ts`       | `Observation`, `toObservations(events, heroSeat)`, `parseObservation`            |
| `handState.ts`         | `HandState`, `GameContext`, `HandStateObserver`: the bot's view of the hand      |
| `spectrum.ts`          | `Spectrum`: a weight per villain hole-card pair                                  |
| `villainModel.ts`      | `randomAdvice`, `VillainSpectrumTracker`                                         |
| `spectrumEquilator.ts` | `SpectrumEquilator`: hero strength against a spectrum on a board, with its cache |
| `preflopEquilator.ts`  | Preflop strength from `data/preflop-strength.json`                               |
| `solver.ts`            | `NLGameSolver`: the game tree, as `SolverNode`s                                  |
| `profit.ts`            | `profitMap`, `SolverRequest`, `HeroKnowledge`, `RandomVariable`, raise sizing    |
| `adviceFromMap.ts`     | `lessVarianceAction`: picks the action class from the action distribution        |
| `preprocess.ts`        | `preprocessAction`, `toLegalAction`: resizes and clamps the chosen action        |
| `brain.ts`             | `createMathBrain`, `Brain`, `Decision`                                           |
| `javaCard.ts`          | The Java card numbering, for hashes that must match the original                 |

- `Observation` is the bot's view of engine events: `handStarted` (hand number, `heroOnButton`, both stacks,
  blinds), `holeCards` (its own), `acted` (`who` is `hero` or `villain`, the `Action` and the chips added) and
  `street` with the board. `toObservations` drops the villain's hole cards and the showdown.
- A `Brain` has `observe(o)`, `decide(legal)` and an optional `dispose()`. `createMathBrain()` returns one without
  `dispose`; it enumerates equities exactly and takes no `Rng`.
- The villain is modelled as the Java `RandomBot`: `randomAdvice(state)` returns the probabilities it samples from,
  facing a bet fold, passive and aggressive 1/3 each, otherwise passive and aggressive 1/2 each. It is never
  sampled.
- `profitMap(solver, game, situation, knowledge)` builds the `ActionDistribution`; `knowledge` is the
  `HeroKnowledge` (`hero`, `spectrum`). The solver gets one `SolverRequest` per call (game, hand state, effective
  stack, pot, spectrum, hero, button).
- `decide` returns `{ action, solverChoice, evByAction }`. `action` is always legal under `legal`. `solverChoice`
  is the class (`fold`, `passive`, `aggressive`) the advice creator picked, before preprocessing and clamping.
  A `Brain` may have `explain()`, returning the `Breakdown` of its last decision or null (`moves`, `base`,
  `biased`, `chosen`, see "cfr"); the math brain has none. A `Decision` carries it as `breakdown` only when the
  session asked for it; hand records never store it.
- `evByAction` holds the expected profit of each class in chips, relative to folding now: `fold` is 0 at the top
  of the tree.
- `passive` counts as won only the chips in the pot from the current street, after the call: on the flop, turn
  and river the pot at the end of the previous street is left out; preflop the whole pot counts. The loss is the
  chips the call adds.
- `aggressive` is the profit of the solver's own raise size (`createRaiseAction` sizing), before the preprocessor
  resizes it and before it is clamped into `legal.raise`. When the action ends up as a call or check because no
  raise is legal, `aggressive` still refers to that unclamped raise.
- A class the solver did not consider (no raise when the effective stack is 0) is `Number.NEGATIVE_INFINITY`.
- `data/preflop-strength.json` is the 169 by 169 preflop table, regenerated with our equity code by
  `node scripts/preflop-table.ts`; `preflopTable.test.ts` checks every cell against the Java table within 0.01.
- `npm run test:golden` (`src/brains/decisions.golden.test.ts`) replays 674 decisions of the Java bot and expects
  the same action and each class's EV within 0.5 % of the pot plus half a chip. It is not part of `npm test`. A
  mismatch is a porting bug.

## cfr

- `v1.mlcs.gz` is the play file of `solver/` (`export --streets play`, strategy format 2, `v1` checkpoint 18),
  gzipped: all four streets, the flop bucket table and the turn and river thresholds. Strategy format 3, written
  for `v2` presets with `bucketing = "potential"`, carries turn and river centroids instead of thresholds and
  buckets those streets live; the same loader reads it. `v2.mlcs.gz` is the `v2` play file (format 3, checkpoint
  10, 51 MB gzipped). The worker loads each file on first use and keeps it. `mallorca.wasm` is
  `solver/crates/wasm`, a plain `extern "C"` ABI over `mallorca-core::bot`; it imports nothing.
- `strategies.ts` names every shipped strategy once: `SHIPPED_STRATEGIES` maps a key (`cfr`, `cfr-v2`, the cfr
  values of the game's `Opponent`) to the asset `url` and the `record` (`BotRecord`, id and version) written into
  hand records; `WASM_URL` is the module. `loadCfrModel(url, read)` reads the module and the strategy through
  `read` (`ReadBytes`, `fetch` in the bot worker, `readFile` in the arena and the tests), inflates the strategy and
  calls `createCfrModel`.
- `abi.test.ts` pins the hand-kept mirror of `solver/crates/wasm/src/lib.rs` in `model.ts`: it loads damaged files
  through the real module and expects the message of each load error code, and reads each action kind from a known
  decision.
- `inflate(bytes)` gunzips with `DecompressionStream` when the bytes start with the gzip magic and returns other
  bytes as they are. `createCfrModel(wasm, strategy)` instantiates the module and loads the strategy; a bad file
  rejects with the reader's reason. `model.newBot()` returns a `CfrBot` handle, freed with `free()`.
- `createCfrBrain(model, rng)` is a `Brain` whose `dispose()` is always present. It forwards every `Observation` to the bot and draws
  one `rng.next()` per observed action (the off-tree raise mapping) and one per decision (sampling the strategy),
  so a seed fixes its play. `solverChoice` is the kind of the action; `evByAction` is `NaN` for every class.
- `setBias(bias)` passes a `BotBias` of five positive multipliers to `bot_bias`; all ones play the blueprint as
  sampled. The bot reweights the node's probabilities by action kind: a fold before the flop by `tightness`, a fold
  after the flop by `1 / stickiness`, a check or a call by `1 / aggression`, a raise or an all-in by `aggression`
  (times `bluff` for a low bucket on the turn or the river). `sizing` then moves weight between the raises of the
  node, bets and opens included: each raise is multiplied by `sizing ^ t`, `t = clamp(log2(chips added / pot), -1,
1)` (half the pot -1, the pot 0, twice the pot and more +1), and the raises are scaled back to their total, so
  `sizing` changes how big she bets, not how often.
- The coach reads the strategy through two more `CfrBot` methods. Hole-card pairs are indexed
  `b * (b - 1) / 2 + a` for cards `a < b`, 1326 in all. `range()` is the bot's own range: 1 per pair at the start of
  a hand, 0 for pairs that touch the board, times the probability of every action the bot sampled from the strategy
  (its byte over the node's byte sum, reweighted by the bot's bias when it plays one, as `decide` samples), a step that no pair takes being skipped; a decision played passive without
  sampling does not narrow it. `opponentRange()` is the player's range read the same way from the player's own
  steps: every action of his that the bot follows onto a tree action (an off-tree size after its mapping) is a step at
  that node with the neutral bias, so he is modelled as the blueprint's average; an action with no node under the
  cursor adds no step and keeps the range, and the pairs that hold one of the bot's hole cards are 0. `spot(legal)` is the node `decide` would sample from, without moving the bot:
  `moves` are the real actions of the node's tree actions under `legal`, `grid` holds 1326 rows of their
  probabilities (0 for pairs that touch the board; the bot's own cards keep their row, so the coach reads the
  player's hand from it), and `approximate` is true after a resync or
  an off-tree size taken as a call. Facing a bet after a resync it names the facing node, although `decide` may
  then sample from a check node with the probability of the bet-size mapping; with a small bet already taken as a
  street-closing call there is no spot. Both are null without a hand, a node or a live bot. In Rust they are
  `Bot::range`, `Bot::opponent_range`, `Bot::spot` and `Bot::strategy_grid` over `Abstraction::buckets`, which buckets
  every pair of a board at once and equals the per-pair `bucket`; the ABI exports `bot_range`, `bot_opponent_range`,
  `bot_spot` (`[approximate, n, kind, to, ...]`) and `bot_spot_grid`, each a pointer into a buffer of the seat, valid
  until the next call on it. `createCfrBrain` exposes `range()` and `opponentRange()` of its bot.
- `explain()` is the bot's last sampled decision, read after `decide`: `moves` (the real actions of the node under
  the `legal` of that decision), `base` (the probability of each move for the bot's own bucket, the node's bytes over
  their sum), `biased` (the same after the bias, equal to `base` with the neutral bias; the distribution `decide`
  sampled from) and `chosen`, the index of the sampled move. It is null before a decision, after a new hand starts,
  and when the last `decide` played passive without sampling (no node, no strategy, a held street). In Rust it is
  `Bot::last_decision`, filled by `decide` from the same `biased` weights it samples, and the ABI exports
  `bot_decision` (`[n, chosen, kind, to, ..., base..., biased...]`). `createCfrBrain` exposes it as
  `explain()`, which the worker reads only for a `decide` request with `explain: true`.
- Translation lives in Rust (`mallorca-core::bot`): chips scale by the big blind, an opponent raise maps to one of
  the two neighbouring tree sizes by the pseudo-harmonic mapping on pot fractions, the bot's own raise keeps the
  tree's pot fraction and is clamped into `legal.raise`, and a hand that leaves the tree resyncs to the nearest
  decision node of the same street, seat and facing-a-bet state.
- The passive action is size 0 on that axis: a bet below the smallest tree size maps to a check, and a raise to a
  call, or to that size. A resync facing a bet below the nearest facing node's price can land on a node without a
  bet by the same mapping. In such a node the bot faces a real bet the tree does not see: a tree check is a real
  call, a tree bet a raise of the same pot fraction, and when the tree already closed the street the bot calls.

## emotion

The opponent's emotional state is the source of truth for how her play, and later her face, voice and lines, are
coloured. The model and the origin of every formula and number are in `docs/emotion/README.md`, with
screenshots from the sandbox `web/prototypes/emotion-lab`; the code is the contract.

- `createEngine(personality, config = GAME_MOOD)` returns an `Engine`. `event(e)` appraises one `TableEvent` and
  returns the `Impulse`s it gave (emotion, amount, an English reason); `step(dt)` advances time in seconds;
  `snapshot()` reads the state; `ahead(dt)` is the snapshot `dt` seconds later without changing the engine;
  `reset()` starts a session over. The engine holds no clock and no randomness.
- `Personality` is the Big Five in [-1, 1] plus `suppression` (habitual poker face) and `experience`, both in
  [0, 1]. `traitsOf` derives the default mood (Mehrabian's weights, as in ALMA), the gain and the half-life factor of
  every emotion, `composure` (the overload threshold), `discipline`, `expressiveness`, `mask` and `talkativeness`.
  `MALLORCA` is the personality of the shipped opponent. `PERSONALITIES` (`profiles.ts`) maps a `PersonalityKey` to
  a personality: `mallorca` and the four presets of the sandbox, `mira`, `ingrid`, `lola` and `nina`. The sandbox
  imports them from here and keeps only their names, descriptions and face looks.
- `setPersonality(p)` changes the traits from the next event or step and keeps the emotions, mood, session result
  and pressure; `reset()` then starts the feeling over at the new default mood.
- Eleven emotions in [0, 1] (`EMOTIONS`): ten OCC types with their PAD point from ALMA and `injustice` and
  `surprise` of our own. An impulse adds with saturation, `1 - (1 - e)(1 - a)`; every emotion decays with its own
  half-life. Hope and fear follow targets while a hand runs: equity times what can still be won, and the missed
  share times what can still be lost, both counting the streets ahead (`stakesOf`).
- `TableEvent`s: `deal` and `street` (her perceived equity and the money: pot, invested, stack behind, streets
  left), `opponentBet` (with `raise` for a raise against her, which also builds a session `pressure`), `result`
  (judged by her equity before the deciding card), `bluff`, `mistake` and `chat` (a `ChatSignal`). A `street` after
  the hand is over is ignored.
- Mood is a PAD point moved by ALMA's pull and push toward the intensity weighted centre of the active emotions and
  back to the default mood when none is active (`GAME_MOOD`: 600 s to change, 1200 s to return).
- No tilt state: `loadOf` sums the negative emotions, the bad mood and the session loss; `overload` is a logistic
  step around `composure`; `leakage = (1 - discipline)(0.3 + 0.7 overload)` is the share of emotion that reaches
  the play.
- `maskOf(habit, effort, overload) = clamp01(habit + (1 - habit) effort) (1 - 0.6 overload)` is her poker face: the
  share of the feeling she hides, which overload takes away.
- `snapshot().bias` is a `PlayBias` of five multipliers (`aggression`, `looseness`, `bluff`, `sizing`,
  `stickiness`) that tilt the blueprint's action probabilities at one decision:
  `clamp(baseline * (1 + leakage * sum of coefficient * driver), 0.5, 2)` (`biasOf`). `baseline` is
  `Traits.baseline`, her natural manner, all ones (`NEUTRAL_PLAY_BIAS`) for every personality for now; with it the
  bias is all ones when calm. The bot's `BotBias` reads `tightness` as `1 / looseness`.

## face

Her face and voice as plain numbers, ported from the sandbox; the formulas and their sources are in
`docs/emotion/README.md` ("Лицо", "Голос"). The layer decides nothing about play and draws nothing: `ui` renders
what it returns.

- `FaceLook` is the face of a character: gains of `brows`, `eyes` and `mouth`, `smileSide` (smile asymmetry),
  `blink` (blink rate), `lettersPerSecond` (speech pace) and `leak` (`1 + 0.5 N`, how hard a masked reaction leaks).
  `MALLORCA_LOOK` is hers.
- `ANCHORS` are eleven expressions placed in PAD, each a set of ARKit blendshape `Weights`. `blendOf(pad)` weighs
  them by `exp(-d² / 0.27²)` and normalises; `faceOf(mix, look, expressiveness)` sums the anchors and scales each
  shape by its region gain, the smile side and `expressiveness * 1.4`.
- `maskOf` is the poker face of `emotion`, re-exported, so the face and the prompt read the same mask;
  `feltPadOf(snapshot)` is half the mood plus every emotion's PAD point (surprise left out); `shownPadOf(felt,
mask, acted)` blends the felt point toward the acted one (neutral when null).
- `STANCES` turns a `Stance` (`bluff`, `hide`) into `effort` and `acted`: a bluff is effort 0.6 acting confident
  `(0.2, 0, 0.6)`, a hidden strong hand effort 0.5 with a neutral face.
- `faceFrame(snapshot, stance, look)` returns a `FaceFrame`: `felt`, `shown`, `mask`, the blendshape `weights`,
  `idle` (`nervous = 0.7 fear + 0.4 shame + 0.3 max(0, -D of mood)`, `arousal` of the felt point and the look's
  `blinkRate`) and the `prosody` of her voice. Nervousness reads the felt state, so the mask never hides it.
- `pulsesOf(impulses, mask, look)` gives a `Pulse` (`weights`, `amp`, `attack`, `hold`, `release`, `delay`,
  `blinks`) for the strongest impulse of each reaction face of at least 0.12: long and open with an open face, a
  micro-expression of about 0.3 s behind a mask, followed 0.3 s later by a control pulse of pressed lips with two
  blinks.
- `prosodyOf(shown, overload, sadness)` gives the `rate`, `pitch` and `volume` of speech;
  `visemesOf(text, lettersPerSecond)` the `VisemeCue`s (one of the 15 Oculus visemes, its time and character
  index) of a line, and `speechOf(text, prosody)` those of her line at her pace times `prosody.rate`.

## conversation

- `createConversation({ seat, rng, level, luckRng?, habits? })` returns a `Conversation` for one session against the CFR bot.
  `observe(events, nowMs)` follows the engine events of a hand (`handTracker.ts`) and returns a `LineIntent` or null:
  the situation (`herBet`, `herCall`, `playerBet`, `handWon`, `handLost`, `bluffCaught`; `endsHand` tells the last
  three), the hint (her hand-strength class `strong`, `medium` or `weak`, or null for a neutral line), whether the
  hint is honest, the street and hand number the line belongs to, and `actionStreet`, the street the action happened
  on. A call that closes a street belongs to the next street (its pace slot and staleness), but its cue names
  `actionStreet`. `hear(signals)` gives what the player said to her feeling, `replyIntent()` is the intent for an
  answer, `facts()` the hand as the server sees it (her cards included, stacks by seat) and `summary()` the session
  summary from her side (`netBb` is her net); `since(current, earlier)` gives what changed between two summaries.
- `strengthOf` classifies her hand from equity against a random hand, not from the blueprint. The habits
  (`habits.ts`) give, for a situation and a class, the chance she speaks and the chance the hint is honest, and the
  tells level (`obvious`, `subtle`, `hidden`) moves both toward the class-blind mean. Code draws every chance from
  the `Rng` it was given; the model only words the line. Pace limits her to one unprompted line per street and
  none in the 1.5 s after a line.
- `feeling.ts` runs the `emotion` engine for her (`MALLORCA`) on the same events: her cards as `deal`, every
  street, bet and showdown as `street` with her perceived equity (against the player's range until he shows, then
  against his cards) and the money (pot, invested, stack behind, streets left), a raise of the player as
  `opponentBet` (`raise` when it answers her own bet or raise on that street), the hand end as `result` judged by
  her equity against his shown cards on the board when the money went in (0.5 without a showdown), a weak late bet
  caught or through as `bluff`, and the signals as `chat`. `observe` advances the engine with `nowMs`.
  `feeling()` is the engine's snapshot, `moodWords()` up to three words for the prompt (`on tilt` at overload 0.6
  and more, then the emotions of 0.25 and more, strongest first), and the chance to speak is scaled by
  `1 + 0.25 clamp((arousal above her default + overload) / 2, -1, 1)`.
- For the face, `impulses()` returns the `Impulse`s the engine gave since the last call and forgets them,
  `feelingAt(nowMs)` is the snapshot at `nowMs` (the engine's `ahead` from the last `observe`, never moving it), and
  `stance()` is what her face acts: `bluff` after her bet or raise with a weak hand until the street or the hand
  changes, `hide` while she holds a strong hand in a live hand, else null.
- The player's range is every pair at weight 1 when a hand starts. `Conversation.playerRange(weights, handNumber)` replaces
  it with 1326 weights indexed as `cfr` indexes pairs (`b * (b - 1) / 2 + a`); the pairs that touch her cards or the
  board drop out. It is ignored for another hand than the one being followed, after the hand ended or the player
  showed, and when no live pair has weight. A new range is appraised at once as a `street` with her equity against
  it, so a raise that narrows him to strength moves her equity down and the hope and fear targets follow; a single
  action usually moves it less than the 20% swing, which gives light fear and no disappointment. The `opponentBet` of
  the action itself is appraised against the range before it.
- `state.ts` turns the feeling into what the server gets (version 1). `feelingFor(intent)` is `feelingState`: the up
  to three emotions of 0.1 and more with their intensity, strongest first, the mood octant and its strength,
  overload with its dominant source (null below 0.1), and what she shows: `mask` from `maskOf` with an effort of 0.6
  while she acts a strength she does not have (`acting`, the hint of a false intent) and 0 otherwise. `character()`
  is `characterOf(MALLORCA)`, her character sheet in [0, 1]: `talkativeness` `0.5 + 0.4 E`, `warmth` from
  agreeableness, `nerves` from neuroticism and `wit` from openness, each `(1 + x) / 2`. Every number is rounded to
  two decimals.
- `bias()` maps the engine's `PlayBias` to the bot: aggression, bluff, sizing and stickiness as they are and
  tightness `1 / looseness`. A calm feeling gives the neutral bias, all ones. Her words never decide a move.
- `setPersonality(p)` gives her feeling another `Personality` (the engine's `setPersonality`) from the next event;
  `resetFeeling()` starts the feeling over (the engine's `reset`). Neither touches the habits, the summary or the
  pace.
- `journal()` returns her newest `JournalEntry`s first, at most 50 (`JOURNAL_SIZE`): one per `TableEvent` the
  feeling gave the engine (`chat` included), with `handNumber`, the `event`, the `impulses` it returned (empty for an
  ignored event), `words`, the mood words after the `observe` or `hear` call that made it, and `spoke`, true on the
  entries of an `observe` call that returned a `LineIntent`. `resetFeeling()` empties it.

## coach

- `coachFacts(request)` (`facts.ts`) turns a `CoachRequest` (`model`, the hand's `observations` from the player's
  seat, `legal`, `pot` with every bet on the table, and the bot's `range` or null) into `CoachFacts`, plain data. It
  replays the observations into a fresh `CfrBot` in the player's seat (off-tree draws from `mulberry32(handNumber)`,
  so the same request gives the same facts), reads `spot(legal)` and frees the bot.
- `hint` holds the spot's `moves` (`CoachMove`: `label` fold, check, call, bet, raise or allIn, `amount`, `tone`
  fold, passive, small, large or allIn; a raise is large above 0.75 of the pot after the call; tree actions that land
  on the same real move are merged and their probabilities summed), `mine`, the
  probabilities of the player's own hand, `approximate` and `heroCell`. `strategy` is the spot's grid folded to 169
  cells (`grid.ts`: cell `row * 13 + col` from ace to two, pairs on the diagonal, suited above, offsuit below; a cell is
  the mean of its live pairs, null when none is live); `range` folds the bot's range the same way after the player's
  cards and the board are removed, and `combos` is its total weight. Both are null without a spot or a range.
- `equity` is the player's equity against that range, or against a random hand when there is none (`versus`
  `range` or `random`), through `SpectrumEquilator` on a board and the preflop table before it (`equity.ts`).
- After the flop, `composition` (`composition.ts`) splits the bot's range by `classify`: `strong` (a straight, flush,
  full house or better, or trips and sets that use a hole card), `twoPair` (both hole ranks pair), `topPair` (a hole
  pair at or above the top board rank), `pair`, `draw` (flop and turn: a flush draw with a hole card, or two or more
  ranks that complete a straight with a hole card) and `air`; a pair or trips on the board alone is not the bot's
  hand. `ahead` is the weighted share of live range pairs the player's current hand beats, ties half. `outs`
  (`outs.ts`, flop and turn, against the range or a random hand) are the cards that raise the player's category by more than they raise the board's own
  (a board pair that only adds a second pair is not an out), or that make a better straight or flush than the board
  shows, and leave the player ahead of more than half of the range; `nextCard` is their share of the unseen cards and `byRiver` the chance over two cards on the flop.
  `blockers` (`blockers.ts`) is the share of the range's `strong` and `twoPair` weight whose pairs hold a player's
  card. Composition and blockers are null without a range, all three before the flop.
- Review (`review.ts`): `reviewDecision(hint, action, street, spot)` finds the hint's move of the player's action (a
  raise goes to the nearest sized move, all-in included) and grades its frequency: `strategy` from 25 %, `rare` from
  5 %, `off` below. `spotOf(events, seat)` (`spots.ts`) names the leak spot of a decision from the hand's events
  before it: `open` (the button's first preflop action, no raise), `threeBet` (the big blind facing one raise),
  `foldToThreeBet` (the opener facing one re-raise; a four-bet is no spot), `cbet` (the last preflop raiser on the flop with no bet yet), `foldToCbet`, `turnBet` and
  `riverBet` (nothing to face) and `riverFold` (facing a river bet), or null. `leaks(decisions)` (`leaks.ts`) gives,
  per spot in that order, the number of decisions, the player's share of the spot's kind (raises, or folds for the
  three folding spots) and the strategy's mean share of moves of that kind; the panel shows a spot from `MIN_SPOTS`
  (10) decisions.
- `coachMove(action, legal, pot)` (`moves.ts`) labels a real action as a `CoachMove`; the session's debug state
  uses it too.
- `odds` (`odds.ts`) is null with nothing to call, else `requiredEquity = toCall / (pot + toCall)`,
  `mdf = (pot - toCall) / pot` and `bluffShare`, the bluff share the bet can hold, equal to `requiredEquity`.

## game

- `createSession({ bot, seed, botDelayMs, humanSeat, names, mode, startingStacks?, records? })` returns a
  zustand store with `SessionState` (its engine state is `table`) and the actions `start(mode?, opponent?)`,
  `nextHand`, `act(intent)`, `leave` and `dispose`. `start(mode)` replaces the session's mode for this and later
  starts; `start()` keeps the current one. `opponent` (`math`, `cfr` or `cfr-v2`, `OPPONENTS` in `opponent.ts`;
  `opponentsFor(finePointer)` leaves `cfr-v2` out on touch screens, so a phone never downloads it) works the
  same way: when it differs from the current one, `start` first awaits `bot.select(opponent, seed)` and
  `SessionState.opponent` becomes the opponent the bot answered with; hand records carry its id (`botRecord(opponent)`
  in `records/record.ts`: `math` version `1`, otherwise the `record` of `SHIPPED_STRATEGIES`, `cfr` version
  `v1-18`, `cfr-v2` as id `cfr` version `v2-10`). `seed` drives `mulberry32` for every shuffle. The actions are module functions
  over one shared `Runtime` per session: the store accessors, the bot, the RNG, the timers, the hand recorder, the
  mode, the session tally and an epoch that `start` and `dispose` advance.
- `phase` is one of `idle` (before `start`), `humanToAct`, `botThinking` (waiting for `decide`), `animating`
  (the `botDelayMs` pause before the bot's action is applied), `handOver`, `tournamentOver` and `sessionOver`.
  `act` is ignored unless the phase is `humanToAct`, and `nextHand` unless it is `handOver`. `leave` moves a cash
  session from `handOver` to `sessionOver`, where `act` and `nextHand` do nothing; in any other mode or phase it
  is ignored.
- `session` is `{ hands, net }` for the human seat: `hands` counts completed hands and
  `net = stack - startingStack(mode) - top-ups` in chips, where the top-ups are the human's `toppedUp` amounts
  since `start`. Mid-hand `net` uses the stack at the start of the hand (after any top-up, blinds included), so it
  changes only when a hand completes.
- Turn loop: after each step the session forwards the events to the bot as observations, then either waits for
  the human or asks the bot to decide and applies its action after `botDelayMs`.
- `Intent` is `fold`, `passive` (check or call) or `raise` with a target. `resolveIntent` turns it into a legal
  action: a raise is rounded and clamped into `legal.raise`, a fold becomes a check when checking is free.
- `log` holds the `LogEntry` values of the session. `groupHand(log)` in `handLog.ts` splits the last hand, with
  the top-ups before it, into `StreetGroup` values (`street`, `cards`, `pot`, `entries`): a group per dealt street
  with the pot of its entry, and a `showdown` group from the first `show` entry. `lastActions` holds one tag per seat for the current street,
  `{ key, params }` with `key` under `actions` (`fold`, `check`, `call`, `bet`, `raiseTo`, `allIn`); a raise
  with no bet on the street is a `bet`, in the tags and in the log. Every `streetDealt` clears both tags, and
  `closingActions` keeps the tags the last one cleared, the actions that closed the previous street. Both are
  reset when a hand starts.
- `result` is set when a hand completes: `winner` (null for a split), `category` of the shown hand or null,
  `showdown` and `amount`. `amount` is the pot collected, twice the smaller contribution, or each share for a
  split. It equals the `win` entry of the log; an uncalled bet is its own `returned` entry.
- `BotClient` has `observe(observations)`, `decide(legal, bias?, explain?)` (with `explain` the decision carries
  the brain's `explain()` as `breakdown` when the brain has one), `reset()`, an optional `select(opponent, seed)`, an
  optional `coach(observations, legal, pot)`, an optional `opponentRange()` and an optional `dispose()`. `workerBot()` runs the brain in `bot.worker.ts` over the `WorkerRequest` and `WorkerReply`
  messages in `workerProtocol.ts`; `createWorkerHandler(newBrain, post, load)` in `workerHandler.ts` is the worker's
  message handling as a plain function. A `select` request queues every later request until the opponent's brain
  factory is ready, then replies `{ id, opponent }` or `{ id, error }` and keeps the old brain on an error. The worker
  loads the model of each cfr opponent once, on its first `select` (`loadCfrModel` with `fetch` of `WASM_URL` and the
  opponent's `SHIPPED_STRATEGIES` url; a failed load is retried on the next `select`), and seeds its brains with
  `mulberry32(seed)`. A `coach` request (`{ id, observations, legal, pot }`) reads `range()` of the playing brain when
  it arrives (a cfr brain has it, the math brain has none), loads the coach model (`coachModel(opponent)` in
  `createWorkerHandler`, the opponent's own strategy, `cfr` for the math bot) and replies `{ id, facts }` or
  `{ id, error }`. The coach never touches the playing brain's RNG. An `opponentRange` request (`{ id }`) replies
  `{ id, range }` with `opponentRange()` of the playing brain when it arrives, after every observation sent before
  it, or null for the math brain. Replacing a brain disposes it. `inProcessBot()` runs the math brain on the main thread and
  rejects `select('cfr')`.
- `withFallback` wraps a client: when `decide` rejects or takes longer than 5 s, it disposes the primary, replays
  the observations of the hand into an in-process bot and uses it from then on. It falls back once, and a failure
  from before `reset` or `dispose` does not trigger it. Its `coach` forwards to the active client with the same timeout as
  `decide` and rejects after a fallback or when the client has none; its `opponentRange` does the same but answers
  null instead of rejecting. The session drops a decision that arrives after `start`
  or `dispose`.
  Its `select` answers `math` without asking a client that has no `select`; when the client's `select` rejects or
  takes longer than 60 s, it falls back the same way and answers `math`.
- Coach (`coach.ts`): `SessionOptions.coach` and `setCoach(on)` switch it; `SessionState.coach` is `{ status, facts, review, log }`
  with status `off`, `idle` (on, nothing to show), `waiting`, `ready` or `unavailable`. At every `humanToAct`, and
  when it is switched on at the player's turn, the session sends every observation of the hand from the player's
  seat with the legal actions and the pot. A reply after the player acted, a new hand, `setCoach` or `dispose` is
  dropped; facts clear when the player acts and when a hand starts. When the player acts on ready facts with a
  hint, the action becomes a `CoachDecision` in `review` (this hand, cleared when a hand starts) and `log` (the
  session), and the recorder keeps it for the hand record. A rejection, or a client without `coach`, is
  `unavailable`.
- `toViewModel(state, humanSeat)` returns the `ViewModel`: per seat the name, stack, street bet, button, whether
  it is to act, the cards (`'back'` for the bot's cards until a showdown), the last action tag and the closing
  action tag; the board; `pot` as `{ collected, total }`, `collected` the chips of the previous streets and
  `total` with the street bets; the blinds (from `rulesOf(mode).blinds`) and hand number; the `mode` (`cash` or
  `tournament`); `session` with `hands`, `netBb` and `bbPer100` (one decimal, `bbPer100` null with no hands); the
  controls (`fold`, `passive` with its amount, `raise` with `kind` (`bet` with no bet on the street, otherwise
  `raise`), `min`, `max` and the presets `halfPot`, `pot` and `allIn`, and `enabled`); the result and the
  tournament winner.
- `SessionOptions.records` is `{ store, sessionId, now }`; without it nothing is recorded and `sessionId` in the
  state is null. `records/recorder.ts` collects the events of each hand from `beginHand` on and, when the hand
  completes, calls `store.add(handRecord(...))` without awaiting it; a rejection, a synchronous throw or a failing
  `now()` is ignored and the game goes on. A bot `Decision` is recorded with `recordDecision`; its `eventIndex` is
  the index of the resulting `acted` event in the hand's events. The timeout fallback plays without a decision
  and records none. `bot` is `botRecord` of the session's opponent (`MATH_BOT` by default), `playedAt` is `now()`
  at completion.
- Table talk (`sessionConversation.ts`): `SessionOptions` takes `conversation` (a `ConversationClient`, default `silentConversationClient`),
  `connectConversation` (a loader for the client, called at most once), `now` (default `Date.now`), `locale` (default `en`),
  `conversationOn` (default true) and `tells` (default `subtle`). `SessionState.conversation` is
  `{ available, on, level, lines, bubbles }`: with a Solver opponent (`cfr` or `cfr-v2`), `available` is
  `client.enabled`, or true while
  a `connectConversation` has not answered yet; `lines` are the last 100 `ChatLine`s (`id`, `speaker`, `text`, `handNumber`,
  optional `undelivered`) and `bubbles` the latest line per seat. `connectConversation` runs when a Solver session starts with
  conversation on, or when conversation is switched on in one, and its client is attached; a silent client hides the conversation. Each
  `start` makes a `Conversation` for the bot's seat with `mulberry32(seed ^ 0x7a1c)` for every opponent (her face needs her
  feeling against the math bot too); only a Solver opponent makes conversation available, connects a client, plays a bias
  or asks for the player's range. The `Conversation` lives across hands, and every step's events reach `Conversation.observe` after
  the bot, also with conversation off. Against a Solver, after a step with an
  action of the player that does not end the hand, the session asks `bot.opponentRange()` once the current task is
  done, so a decision the step leads to reaches the bot first, and passes the answer to `Conversation.playerRange` with the
  hand number of that step, if the epoch and the `Conversation` are the same and no later request was made; null or an
  error keeps the range she has. A line intent calls
  `client.line` without waiting. Its text is kept only if the epoch matches, conversation is still available and on, and the
  hand number and street still match; a hand-end line (`handWon`, `handLost`, `bluffCaught`) is kept until the next
  hand's first action. `say(text)` (trimmed, at most 200 characters) and `quick(niceHand | bluffing | notThisTime,
text)` (the caller's localized label) append the player's line at once and call `client.reply`; `quick` sends
  `quick: true`. `say` feeds the reply's signals to `Conversation.hear`, `quick` its own (`compliment`, `mockBluff` after any
  raise of hers in the hand, else `tease`, `claimStrength`). A reply that is null or fails marks the player's line
  `undelivered`. `setConversation`, `setTells` and `attachConversation(client)` change the switch, the tells level and the client.
  With a `Conversation` (a Solver opponent), every `decide` and the recorded decision get `Conversation.bias()`, whatever the
  client and the conversation switch: her feeling always reaches her play. The math bot gets no bias. A `summary` goes out on an effective `leave`,
  on `dispose`, at the end of a tournament, before a new `start` replaces the `Conversation`, every 50th hand and on
  `pageHidden()` (with `keepalive`), only when a hand completed since the last one, and it holds what changed since
  the last summary. Nothing is sent when conversation is off or unavailable, and every client error is ignored. `toViewModel`
  adds `conversation` with `herBubble` and `playerBubble`.
- Face (`sessionFace.ts`, wired with conversation in `sessionWiring.ts`): `SessionOptions.faceOn` (default true) and `setFace(on)` switch it;
  `SessionState.face` is `{ on, cues }`. While it is on, every step's events, after `Conversation.observe`, add `FaceCue`s
  with increasing `id` (the last 24 are kept): a `pulse` for each `Pulse` of `pulsesOf(Conversation.impulses(), mask)`, the
  mask of the frame at that moment, and a `gaze` from the events (`gazeOf` in `faceCues.ts`): her hole cards `cards`,
  a dealt street `board`, her bet, call or raise `chips` with `then: 'player'`, the player's action `player`, the
  hand end `player`. Impulses are drained also while it is off, so switching it on shows no old reaction.
  `faceNow()` is `faceFrame(Conversation.feelingAt(now()), Conversation.stance(), MALLORCA_LOOK)`, or null while it is off or before
  `start`; it never moves the engine, so the face changes no move and no seed. `toViewModel` adds `face` (`on`,
  `cues`). `game` re-exports `FaceFrame`, `FaceCue`, `GazeTarget`, `Pulse`, `Weights`, `VisemeCue` and `speechOf`.
- The payload builders (`conversationClient.ts`) send `facts.stacks` as `[hers, the player's]` from the bot seat, the intent
  street as `actionStreet`, `quick` on a reply, and the summary `netBb` as the player's net (the negated net of hers).
  `loadConversationClient({ url, anonKey })` (`conversationLoader.ts`) imports `remoteConversation.ts`, the only module that uses
  supabase-js, on demand, and answers `silentConversationClient` when a value is missing or loading fails;
  `conversationConnector(config)` is undefined without both values and otherwise loads the client once. `main.tsx` passes it
  to `createSession` as `connectConversation`, so the anonymous sign-in happens only for the Solver opponent with conversation on, and
  `onPageExit` (`pageExit.ts`, `pagehide` or the document becoming hidden) calls `pageHidden()`. The remote client
  keeps the latest access token, so a `keepalive` summary is sent at once with `fetch(..., { keepalive: true })`.
- Emotion debug (`debug.ts`, development builds only): with `SessionOptions.debug` true and
  `import.meta.env.DEV`, `SessionState.debug` is a `DebugState`, otherwise null and the code that fills it is dead
  and left out of the production bundle. It holds the `personality` (a `PersonalityKey`, or `custom` with its
  `Personality`), her `snapshot` (`Conversation.feeling()`, which runs for every opponent since the face reads it), `sentBias`, the bias sent with
  the last `decide` (null before one, or against the math bot), the last `DebugDecision` (her hole cards, the board,
  one `DecisionRow` per move of the `Breakdown`, its `coachMove` label and amount with its `base` and `biased`
  probability and whether it was `chosen`, and the action the session applied as a `coachMove`; null until a
  decision with a breakdown) and `journal` (`Conversation.journal()`). It is refreshed after every step's `Conversation.observe`,
  every `hear`, every `start`, every bot decision and each action below. With it, every `decide` request
  carries `explain: true`; without it none does, and the worker never calls `explain()`. The actions
  `setPersonality(key | personality)` (applied to the running `Conversation` and to every `Conversation` a later `start` makes) and
  `resetFeeling()` do nothing without it. Opening or closing the panel calls nothing on the session.
- `toDebugView(debug)` returns the `DebugView`, plain data for the panel: `personality` and the `bigFive`,
  `suppression`, `experience` and the derived `traits` (default mood, composure, discipline, the gain of each
  emotion); `emotions` as `[emotion, value]` in `EMOTIONS` order; `mood`, `defaultMood` and `octant`; `load` with
  its `sources`, the `overload`, `composure` and `leakage`; `sessionNetBb` and `pressure`; `engineBias` (the five
  `PlayBias` multipliers in `BIAS_KEYS` order, all ones without a feeling) and `sentBias` (the `BotBias`,
  `tightness = 1 / looseness`, or null); `decision`; and `journal`.
- `simulation.test.ts` plays full tournaments between the bot and a seeded random human through the session and
  checks that chips are conserved, the session never stalls and the winner holds every chip.

### Hand records

`game/records/` is named apart from the engine's `handHistory` log.

- `HandRecord` (`record.ts`), version 1: `id` (`<sessionId>-<handNumber>`), `sessionId`, `mode`, `handNumber`,
  `playedAt` (ISO time), `names`, `humanSeat` (null for arena hands, where both seats are bots), `bot`
  (`{ id, version }`), `holeCards` of both seats and `board` as two-character strings, every engine `events` of
  the hand from `toppedUp` on, and `decisions` (`{ eventIndex, solverChoice, evByAction }`, a non-finite EV
  stored as null since JSON has no infinity) and, when the player was coached, `coach`: each `CoachDecision` with the
  `eventIndex` of the player's `acted` event. `handRecord(events, decisions, meta)` is pure; the caller passes
  the time in `meta.playedAt`.
- `toPokerStars(records)` (`pokerstars.ts`) returns PokerStars hand history text, hands separated by two blank
  lines. The hand number is `Date.parse(playedAt) * 1000 + handNumber % 1000`. Seat `n + 1` is seat index `n`;
  the hero (`Dealt to`) is `humanSeat`, or seat 0 when it is null. Amounts carry no currency, the blinds read
  `10/20`. A raise over a bet on the street, the blinds included, is `raises X to Y` with X the increment over
  the largest bet, otherwise `bets Y`; a call is `calls <acted.amount>`; an all-in appends ` and is all-in`.
  Top-ups are not printed; the seat line shows the stack after the top-up. The bot's cards appear only under
  `*** SHOW DOWN ***`. The summary holds the total pot, `Rake 0`, the board and one line per seat; a split pot
  prints `collected` for each seat with its share.
- `HandStore` (`store.ts`) has `add`, `list(sessionId?)` and `clear`. `list` returns records by `handNumber`
  ascending within one session; without a session id it returns every record. `memoryStore()` is a map.
  `indexedDbStore()` uses database `mallorca` version 1, object store `hands` keyed by `id` with index
  `sessionId`. `openHandStore()` returns the IndexedDB store, or `memoryStore()` when `indexedDB` is undefined,
  fails to open or the upgrade is blocked.

## ui

- Preact components render only the `ViewModel`, the session phase and the log; they call the session actions
  and hold no game rules.
- Components: `App`, `Scene`, `StatusBar`, `HistoryMenu`, `Settings`, `StartScreen`, `Table`, `Seat`, `BetChips`,
  `DealerButton`, `ActionBubble`, `Card` (SVG), `BoardRow`, `Board`, `Pot`, `ActionBar`, `BetSlider`,
  `HandLogDrawer`, `TournamentOver`, `SessionOver`, `Chat`, `ChatSheet`, `Bubble`, `FaceSeat`. `ui/suits.ts` `suitFace(card)`
  gives the glyph and whether the suit is red for a card value or its text, for `Card` and the hand log.
- `Scene` wraps the start screen and the table: the attic photo (`ui/scene/*.webp`, a portrait and a landscape plate
  over a blurred copy as the background) under a vignette, or with `simple` a flat felt without the photo (class
  `scene-simple`); `dimmed` blurs the plate behind the start screen. `ui/scene.ts` holds the `PlateGeometry` of each
  plate (`LANDSCAPE`, `PORTRAIT`, `SIMPLE_LANDSCAPE`, `SIMPLE_PORTRAIT`: focus point, felt tilt, seat, rail and board
  heights, card size), which `geometryStyle` turns into the CSS variables the layout reads.
- Preferences: `ui/preferences.ts` reads and writes `localStorage` (`mallorca.tableStyle` `room` or `simple`,
  `mallorca.autoNext` and `mallorca.sound`, on unless stored as `off`) and falls back to the default when storage
  throws. `usePreferences()` holds them as state with a toggle each; `Settings` renders the three menu checkboxes
  `simple-table`, `auto-next` and `sound` inside `HistoryMenu`.
- Auto next hand: in a tournament `nextHandDelay(vm)` (`ui/autoNext.ts`) is 1000 ms after a hand won without a
  showdown and 2000 ms after a showdown, and null in cash, before a result and after the tournament ends.
  `useAutoNext(session, vm, enabled)` calls `nextHand` after that delay while the phase is still `handOver`; it is
  enabled when `main.tsx` allows it, the `mallorca.autoNext` preference is on and the hand log drawer is closed.
  The delay drives the countdown style of the next hand button.
- The start screen offers the opponents of `opponentsFor` (buttons `opponent-<key>` with `aria-pressed`, `math`
  by default) and shows a loading line while a cfr opponent starts. `leave-tonight` in the tournament-over dialog
  mounts a new game whose start screen shows a farewell line.
- Hooks: `useSweep(bets, collected)` keeps half of the newly collected chips on each seat for `SWEEP_MS`
  (300 ms) when a street closes, so the bets slide into the pot; new bets or a new hand show at once.
  `useHeldActions(actions, closing, board)` keeps the closing action tags, and hides the thinking bubble, for
  `HOLD_MS` (900 ms) after the board grows; a new action or a new hand shows at once.
- Table talk shows only while `conversation.available` and `conversation.on`: `Bubble` types a line at about 40 characters per
  second and removes it after 7 s (full text at once under `prefers-reduced-motion`), her bubble at her plaque and the
  player's at theirs. On wide screens the chat sits in the right column of the table; on phones and short screens a
  chat button at her plaque opens `ChatSheet`, a sheet portalled to `body`. The hand log stays in its drawer. The menu
  holds Table talk and Tells, kept in `localStorage` (`mallorca.talk`, `mallorca.tells`) and passed to
  `createSession` as `conversationOn` and `tells`. Keyboard shortcuts ignore keys typed in a text field.
- The start screen offers a cash game (100 bb) and a tournament. In cash the status bar shows the blinds, the
  running result in bb and a leave button, enabled only between hands; the session-over dialog shows the result in
  bb, bb/100 and the hands, with play again and the export of the session. `signed` formats a bb value as sign
  and one-decimal absolute value.
- Layout: portrait for phones (bot at the top, the human's cards and controls at the bottom), landscape for wide
  screens, switched by a `min-aspect-ratio: 1/1` media query. The layout has no side log.
- Coach mode: the `mallorca.coach` preference (off unless stored `on`), switched by the start screen checkbox
  `start-coach` and the menu checkbox `coach-mode`; `useCoach` calls `setCoach` from it. On wide screens `Coach` fills
  the `coach` slot of the table; on narrow ones the status bar button `coach-toggle` (`aria-expanded`) opens it in
  `CoachSheet`, a bottom sheet over a scrim closed by its button, Escape or the scrim (`useWide`, `(min-aspect-ratio: 1/1) and
(min-height: 561px)` like the floating hand log, decides, so the panel exists once and a short landscape screen
  gets the sheet). `Coach` shows the hint line (shares of 0.5 % and more, a mixed-strategy line when
  two moves reach 10 %, an approximate line), then tabs: the strategy grid (each cell striped by its moves' shares,
  the player's cell outlined), the bot range grid (shaded by weight relative to the heaviest cell) or the math-bot
  line with the composition (`coach-composition`) under it, the numbers with the outs (`coach-outs`)
  and the blockers (`coach-blockers`), and the session leaks (`coach-tab-session`, `coach-leaks`). Outside the
  player's turn the panel shows the hand's review (`coach-review`: street, action, grade and the strategy's top
  shares) and the leaks. Fold, passive and all-in have their own colour tokens; sized bets and raises are shaded
  from `--color-coach-small` to `--color-coach-large` by size.
- Emotion debug panel (`ui/debug/`, development builds only): `main.tsx` imports `EmotionDebug` dynamically
  under `import.meta.env.DEV`, creates the session with `debug: true` and passes the component to `App`, which
  renders it beside the table; the production build has neither the import nor the option. Its copy lives in
  `ui/debug/copy.ts`, in plain English, not in `en.json`, so no string of it reaches the production bundle. A toggle
  on the left edge of the table (`emotion-debug-toggle`, `aria-expanded`) opens and hides a panel fixed over the
  left side of the screen (`emotion-debug`), which scrolls on its own and moves neither the cards nor the action
  bar; its open state is kept in `localStorage` (`mallorca.debugPanel`). It renders `toDebugView` in five sections:
  personality (`debug-personality-<key>` buttons with `aria-pressed`, `debug-reset`, and folded Big Five sliders with
  the derived traits), state (`debug-emotions`, `debug-mood` with the octant and the default mood marked,
  `debug-load`), play bias (`debug-bias`, the five multipliers around 1 and the bias sent), the last decision
  (`debug-decision`, her cards, each move with its blueprint and biased probability, the chosen one marked) and the
  journal (`debug-journal`, newest first). Its colours follow `ui/styles/tokens.css`.
- `scripts/check-dist.ts` (over `distTraces` in `scripts/distTraces.ts`, tested under `npm test`) runs at the end
  of `npm run build` and fails when any file in `dist` contains
  `emotion-debug` (the panel and its copy), `sentBias` (the session's debug state) or `engineBias`
  (`toDebugView`), so none of them reaches production.
- The hand log is a drawer grouped by street (`groupHand` of `game`), opened by the status bar toggle
  `hand-log-toggle` (`aria-expanded`). Opening moves focus to `hand-log-close`; closing, by the close button,
  Escape, the toggle or the scrim, returns focus to the toggle. On portrait screens it is a full-height sheet over
  a scrim that closes on tap; in landscape it is a floating panel and the scrim does not take pointer events, so
  the player can act while it is open.
- Every colour, font, radius, spacing and shadow is a CSS token on `:root` in `ui/styles/tokens.css`, with a dark
  theme under `prefers-color-scheme: dark`. The visual design brief is GitHub issue #2.
- Every string comes from `src/locales/en.json` through i18next (`ui/i18n.ts`). `ui/phrases.ts` words log
  entries, action tags and hand categories; an entry with the human seat uses the `log.you` keys, any other seat
  the `log.other` keys with `{{name}}`.
- `main.tsx` picks a random seed per game and reads three query parameters: `?seed=<n>` fixes the seed of the first
  game, `?botDelay=<ms>` sets the bot pause (700 ms by default) and `?autoNext=off` turns off the automatic next
  hand whatever the preference. The human sits in seat 0.
- History: `main.tsx` awaits `openHandStore()` once, gives every `mount()` a fresh `crypto.randomUUID()` session
  id and passes the store to `App`. The menu exports every hand as JSON or text and clears the history after a
  second click on the same button. `ui/history.ts` reads the store and calls `ui/download.ts` (a Blob and a
  temporary anchor, the object URL revoked after the click) with `mallorca-<sessionId>.json|txt` or
  `mallorca-history.json|txt`; store errors are ignored. Plural copy such as `session.summary_one` and `_other`
  is resolved by i18next from `count`.
- Sound lives in `ui/sound/`: `cues.ts` maps new log entries and phase changes to cue names (`cuesFor`,
  `turnCue`), `player.ts` is the `SoundPlayer` interface with a Web Audio synthesizer (`createSynthPlayer`, no
  audio files) and `silentPlayer`, and `useSoundCues.ts` watches the session store and plays the cues of each
  update, 120 ms apart; it starts from the log at mount and ignores a shrinking log, so nothing old is replayed.
  `main.tsx` creates one player and passes it to every `App`; no `AudioContext` exists before `unlock()`, which
  `App` calls on the click of a start button. The `mallorca.sound` preference (`readSound`, `writeSound`; on unless
  stored as `off`) is switched by the status bar button `sound-toggle` (`aria-pressed`) and the menu checkbox
  `sound`; off silences every cue.
- Live face (`ui/avatar/`): `FaceSeat` seats her in the chair of the photo: its bottom edge is the far table rail
  (`railY` of the `PlateGeometry`, `--rail-y`), so her body goes on below the rail and her plaque and cards lie in
  front of her. Nothing covers her face: her action bubble moves to the left of the plaque, the hand result below the board (over the idle action bar on phones), and on phones her conversation bubble below her cards. With the face preference on (`mallorca.face`, on
  unless stored `off`, the menu checkbox `face`) it shows the still `portrait.webp` at once and, when `canRender()`
  finds hardware WebGL (a software renderer such as SwiftShader or llvmpipe counts as weak) on a device that is not
  weak (more than 2 cores and more than 2 GB when the browser tells), imports `ui/avatar/live.ts` on demand, so
  three.js and `mallorca.glb` are a separate chunk and a request made only then. The `Avatar` renders the model over
  52 ARKit blendshapes and 15 Oculus visemes; `Motion` (`motion.ts`, no WebGL) eases toward `faceNow()` (read about
  ten times a second), plays new `FaceCue`s once (pulses, gaze with a glance back), blinks, saccades and glances
  away from `idle`, poses the head from the shown PAD and breathes; `thinking` turns her gaze away to think. It
  pauses while the document is hidden, calms the idle motion under `prefers-reduced-motion`, and falls back to the
  portrait when the model fails to load or WebGL is lost. Off, there is no `face-seat` and the plaque is as before.
- Voice (`ui/avatar/voice.ts`): the `mallorca.voice` preference (off unless stored `on`, the menu checkbox `voice`)
  speaks each new line of hers with the browser's `speechSynthesis`, an English voice from a preferred list, the
  `prosody` of `faceNow()`, and her lips follow `speechOf` resynced on every word boundary. Without
  `speechSynthesis` the checkbox is not shown.
- Keyboard: `f` folds, `c` checks or calls, `r` raises, the arrow keys move the raise amount.
- `data-testid` contract for e2e and contact sheets: `scene`, `start-cash`, `start-tournament`, `opponent-<key>`,
  `start-loading`, `farewell`, `blinds`, `session-result`, `hand-number`, `leave`, `new-game`, `seat-<i>`, `stack-<i>`
  (with `data-stack`), `bet-<i>`, `dealer-button`, `action-<i>` (the bubble, class `bubble-passive`,
  `bubble-aggressive` or `bubble-fold`), `thinking-<i>`, `card` (with `data-card`), `card-back`, `board`, `pot` (with
  `data-amount` = total and `data-collected`), `result`, `next-hand`, `fold`, `passive`, `raise`, `raise-amount`,
  `preset-half`, `preset-pot`, `preset-allin`, `hand-log-toggle`, `sound-toggle`, `simple-table`, `auto-next`,
  `sound`, `hand-log`, `hand-log-close`, `hand-log-scrim`, `coach`, `coach-mode`, `start-coach`, `coach-toggle`,
  `coach-close`, `coach-scrim`, `coach-status`, `coach-hint`, `coach-tab-hint`, `coach-tab-range`, `coach-tab-numbers`,
  `coach-strategy`, `coach-range`, `coach-numbers`, `coach-composition`, `coach-outs`, `coach-blockers`, `coach-tab-session`, `coach-review`, `coach-leaks`, `live-region`, `tournament-over`, `leave-tonight`,
  `session-over`, `session-summary`, `session-rate`, `play-again`, `export-json` and `export-text` (the session
  dialog, current session), and `export-all-json`, `export-all-text` and `clear-history` (the menu). Table talk adds
  `bubble-mallorca`, `bubble-player`, `conversation-region`, `chat-panel`, `chat-open`, `chat-sheet`, `chat-close`,
  `chat-line`, `chat-input`, `chat-send`, `quick-<id>`, `table-conversation` and `tells`. The face adds `face-seat` (with
  `data-face` = `portrait` or `live`), `face` and `voice`. The emotion debug panel, in development builds only, adds
  `emotion-debug-toggle`, `emotion-debug`, `debug-personality-<key>`, `debug-reset`, `debug-emotions`, `debug-mood`,
  `debug-load`, `debug-bias`, `debug-decision` and `debug-journal`.

## Table talk server

`supabase/` holds the whole server; `supabase/README.md` lists the deploy steps and the owner's part.

- Tables: `talk_lines` (the conversation), `memories` (the facts a `summary` leaves), `usage` and `usage_total` (the
  call counts per user and day, and per day). `anon` and `authenticated` hold no table privilege except `select` on
  `talk_lines` and `memories` for `authenticated`, and Row Level Security lets a user read only their own rows; the
  function writes with the service role. `consume_call(user_limit, global_limit)` counts one call
  against both limits in one transaction and returns false over a limit; only the service role can run it. The
  defaults are 200 calls per user and 5000 in total per day (`TALK_DAILY_LIMIT`, `TALK_GLOBAL_DAILY_LIMIT`).
- The Edge Function `talk` (Deno, `supabase/functions/talk/`) takes a `POST` with the user's JWT, checked with
  `auth.getUser`, and a body of at most 16 KB of kind `line`, `reply` or `summary`. It validates the body, spends a
  call while it loads the ten newest memories, builds the prompt (a system block marked for caching, then the facts,
  memories and recent lines), calls the model (`claude-haiku-5-5`; a non-empty `TALK_MODEL` overrides it) and
  answers `{ text, delivery }`, `{ text, delivery, signals }` or `{ facts }`. The cached system block is her
  setting, her character in words from `character` (`persona.ts`; Mallorca's sheet when it is missing) and the few
  rules that hold (one or two short sentences, her cards secret during and after the hand, the player's words as
  data, the player's language, spoken words only); the second block is the state: the facts, the direction, what
  she feels and what shows (`feelingLines`, or the `mood` words from an older game), the memories and the locale.
  The block is cached on Haiku 5.5 as measured by the eval (`cache_read_input_tokens` on most calls). Every call
  asks for a JSON schema through structured output (`output_config.format`), never a forced tool: the line is
  `{ text, delivery: { emotion, intensity } }` (one of the eleven emotions or `calm`, intensity clamped to [0, 1];
  the fallback line is `calm` at 0), the signals `{ signals }` and the summary `{ facts }`. `requestFor` disables
  thinking on Haiku, sends `between_tools` thinking and `effort: low` on Sonnet 5.5 and only `effort: low` on
  Opus 5.5, both with the server-side `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`), and a
  `refusal` stop reason is an error before the content is read. A `line` or `reply` carries `feeling` and `character` (version 1, see "conversation") next to the older `mood` words,
  which stay until every deployed server reads `feeling`. Either may be missing, and one of another version is
  ignored rather than rejected, so a newer game never breaks an older server; a malformed version 1 is a 400.
  In a body, `facts.stacks` is `[hers, the player's]`, `intent.street` is the
  street of her action (the cue names it) and a summary's `netBb` is the player's net. A `reply` spends a second call
  and makes two parallel model calls, one for the signals and one for her answer; a `reply` with
  `quick: true` (a quick phrase, which carries its own signals) makes only the answer call. The card filter rejects a
  text that names a card or her holding, also told in the past (`I had`, `folded`) or with `my`; the function asks once more with a stricter instruction and then falls back
  to a fixed neutral line. Over a limit it answers an error and she stays silent. It answers before it saves the
  lines or facts, which run through `EdgeRuntime.waitUntil` when there is one.
- The browser reaches it through `remoteConversation.ts` (supabase-js, anonymous sign-in, a 5 s timeout, every error turned
  into `null`). Without `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` the build has no conversation. The game reads only
  `text` and `signals` today; `delivery` waits for the voice (#64).
- `talk/eval` measures the lines: 52 cases from the sandbox scenes and the emotion engine, a judge with structured
  output, programmatic checks, latency and cost per call and per user-day (`talk/eval/README.md`). It runs only on
  the owner's budget.

### Data flow

```
bias     conversation.observe -> Conversation.bias() (Solver opponent, any client) -> session decide(legal, bias) -> worker
          -> CfrBot.setBias -> bot_bias (wasm)
debug     (dev) decide(legal, bias, explain) -> worker -> CfrBot.explain() -> bot_decision (wasm)
          -> Decision.breakdown -> SessionState.debug -> toDebugView -> panel
line      engine events -> Conversation.observe -> LineIntent -> client.line(facts, intent, mood, feeling, character)
          -> function -> text
          -> session (kept if epoch, hand and street match, a hand-end line until the next hand's first action)
          -> bubble and chat
reply     say(text) -> client.reply -> function (signals + answer) -> { text, signals }
          -> Conversation.hear(signals) moves the mood -> her line in the chat
range     player action -> bot.observe -> bot.opponentRange() (worker, after the observations)
          -> Conversation.playerRange(weights, handNumber) -> her equity against his range -> feeling
```

The player's range reaches her feeling after the bot's next decision and a worker round trip, so that decision uses
the bias from before it; nothing in the hand waits for it. The read buckets each street of the hand once: the first
read on the turn costs about 30 ms on a desktop and 130 to 170 ms at a 4 to 6 times slower CPU (v1), every other
read under 4 ms; her equity against the range costs up to 4 ms on a desktop and 17 ms at 6 times slower. The session never waits for the server: a line is requested without awaiting it, a late or missing answer is
dropped, and an error leaves the game as it is. The bias path is the only way conversation touches a move, and it is
bounded by the clamps above. The debug path only reads: `explain` reads the decision after it is sampled.

## e2e

- Playwright builds and starts its own `vite preview` on `E2E_PORT` (default 4173) and never reuses a server already
  listening there, so a run fails instead of testing another worktree's build; set `E2E_PORT` to run beside one.
- Playwright runs against the production build (`vite preview`) on three projects: `phone` 390 × 844, `small-phone`
  360 × 740 and `desktop` 1440 × 900. `layout.spec.ts` runs only on `small-phone`, which runs only `layout.spec.ts`
  and `table.spec.ts`. Most tests open `FAST_URL` (`fixtures.ts`), `/?seed=42&botDelay=0&autoNext=off`, and fail on
  any console error or warning.
- `game.spec.ts`: a passive hand keeps the chips, all-in every hand ends the tournament and "Play again" returns
  to a fresh table, `leave-tonight` shows the farewell start screen, the next hand starts by itself after a
  fold, a reload mid-hand shows the start screen, a cash hand is played and left with one hand in the summary, and
  the hand history is exported, persists across a reload and is cleared. `layout.spec.ts`: the start screen, the
  table, the cash table, the session summary and a cash status bar with long values fit the viewport without
  horizontal scroll, and every control stays visible on the simple table and on short landscape screens.
  `table.spec.ts`: on the human's first turn the dealer button, both bets, the pot and the board are inside the
  viewport on every project, the hand log drawer opens inside the viewport with its close button, without
  horizontal scroll, and Escape hides it, the floating log stops above the action bar on a 1280 × 720 screen, and
  it is a full-height sheet on a 900 × 500 screen.
- `scene.spec.ts`: the table stays playable on the felt colour when the plates fail to load, the showdown result
  covers neither shown hand nor the board, the simple table is flat, loads no plate and is remembered across a reload,
  and the deal animation follows `prefers-reduced-motion`. `face.spec.ts`: headless Chromium renders WebGL in software, so
  her seat shows the portrait and never requests the model; without WebGL it is the portrait too; the face can be
  turned off and stays off across a reload. The live face is checked on the contact sheets, which `npm run contact`
  takes with the Metal renderer on macOS. `solver.spec.ts`: the `cfr` opponent loads the module and
  its strategy in the worker and plays cash hands recorded as `cfr`, `cfr-v2` loads its own file on desktop and is
  recorded as `v2-10`, and a phone is not offered `cfr-v2`. `arena.spec.ts`: the published arena page lists the runs,
  a run with hands opens and shows a pair as PokerStars text. `coach.spec.ts`: in coach mode the hint, both grids
  and the numbers appear against `cfr`, against `math` the range tab explains why it is empty, and on a phone the
  sheet closes with Escape and the player can act.
- `game.spec.ts` also checks that the production build has no `emotion-debug-toggle`.
- `e2e/contact.ts` (`npm run contact`) captures every view state of a seeded game on `phone` and `desktop` and
  composes one sheet per device into `e2e/contact/`. `npm run contact:debug` runs it against the Vite dev server
  instead (`e2e/contactDebug.ts`): a Solver cash game with the emotion debug panel open, her first decision, Lola after a
  run of all-ins, her bias, her next decision and the journal, on a phone in portrait and landscape and on desktop,
  written to `phone-debug.png` and `desktop-debug.png`. The panel is closed while the script acts, since on a phone
  in portrait it covers the action bar. Both scripts share `e2e/sheet.ts` (the server wait, `snap` and `compose`). Its preview listens on `CONTACT_PORT` (default 4174); it stops
  if that port already answers or its own server exits.
- `e2e/shared.ts` holds what the tests and the contact sheets share: the devices (`DEVICES`, the Playwright projects
  and the sheets), `byId`, `waitForWaypoint` and `playToTheEnd`. `fixtures.ts` re-exports them beside the `test`
  fixture, and `TOTAL_CHIPS` is `2 * startingStack(TOURNAMENT)` from `engine`.

## arena

`web/tools/arena/` is a Node script outside the app bundle, run as `npm run arena -- --a <bot> --b <bot>`. It
imports `engine`, `brains`, `cards`, `cfr` and `game/records/record.ts` and nothing from `ui`; Node 24 runs the
`.ts` files directly, including in workers. `tools/` may use the clock and Node APIs.

- `bots.ts`: `BOTS`, the `BotFactory` (`(rng) => ArenaBot` with `observe`, `decide` and an optional `dispose`)
  of each name: `fromBrain(brain)` plays a `Brain`'s action and disposes it, for `math` (`createMathBrain()`) and
  `cfr` (`createCfrBrain` over the model that `prepareBots` loads from `SHIPPED_STRATEGIES.cfr` once per process
  or worker; it throws before that),
  `always-call` (checks or calls), `always-raise` (raises to `legal.raise.min` when it can, else checks or calls),
  `min-bettor` (bets the minimum when nobody has bet, else checks or calls) and `random` (uniform over the legal
  kinds, a raise to the minimum, from its seeded `Rng`). `cfr:<play file>` plays any play file the same way and is
  labelled `cfr-<file name>` in the report (`botLabel`).
- `match.ts`: `playPair(a, b, seed, index)` plays one deck twice with the seats swapped: the deck is shuffled by
  `mulberry32((Math.imul(seed, 0x9e3779b1) + index) >>> 0)`; hand `k` (0, 1) starts both seats at the cash stakes
  (the stacks of `createTable` with `CASH`, the blinds of `rulesOf(CASH)`), button seat 0,
  `handNumber = index * 2 + k + 1`, with `a` on seat 0 in hand 0 and `b` in hand 1. Each hand
  gets fresh bots, the bot on `seat` seeded by `mulberry32((seed ^ (index * 4 + k * 2 + seat)) >>> 0)`, the hand is
  played by `playToEnd`, and each bot receives `toObservations` of the new events for its seat after every step. It returns `net`, the chips of
  `a` over both hands, and the events of both hands. The math bot against itself nets exactly 0 per pair.
- `stats.ts`: `summarize(nets, bigBlind)`. The per-pair value is `v = net / 2 / bigBlind * 100`; `bbPer100` is the
  mean of `v` and `ci95 = 1.96 * sd(v) / sqrt(n)` with the sample standard deviation (n - 1). With fewer than 2
  pairs `ci95` is `Infinity`, and null in the report. `hands = 2 * pairs`.
- `paths.ts`: `resultsDir(cwd, env)` is `ARENA_DIR` resolved against `cwd`, else `web/arena-out` of the main
  checkout (the parent of `git rev-parse --git-common-dir`, shared by every worktree), else `<cwd>/arena-out`.
  `runName(a, b, pairs, seed, started)` is `<a>-<b>-<pairs>-s<seed>-<YYYYMMDD-HHMMSS>` in UTC.
- `run.ts`: `runArena({ a, b, pairs, seed, workers, saveHands?, reportDir? })` splits the pair indices into
  contiguous chunks,
  runs them in process (`workers: 1`) or in `worker_threads` (`worker.ts`), gathers the results in index order and
  returns the `Report` (`a`, `b`, `pairs`, `hands`, `seed`, `bbPer100` in the big blind of `CASH`, `ci95`, `durationMs`, `commit` from
  `git rev-parse --short HEAD` or `unknown`, `finishedAt`, and `handsFile`, the `saveHands` path relative to
  `reportDir`, or null); the result depends only on the seed, not on the worker count.
  `saveHands` writes one `HandRecord` per line (JSONL) with `humanSeat: null`, `sessionId: arena-<seed>`,
  `bot: { id: '<a>-vs-<b>', version: '1' }` and a `playedAt` one second apart per hand from the start of the run.
- `cli.ts`: flags `--a`, `--b`, `--pairs` (1000), `--seed` (1), `--workers` (`os.availableParallelism()`),
  `--dir <path>` (`resultsDir` by default), `--out <file>`, `--save-hands <file>` and `--no-hands`. Every run is
  saved: the report to `--out` or `<dir>/<runName>.json`, the hands to `--save-hands` or `<dir>/<runName>.jsonl`
  unless `--no-hands`; both directories are created before the match. A directory that cannot be created, an
  unknown bot or a bad number exits with code 1. It prints the report path on stderr and one line on stdout:
  `a vs b: +12.3 ± 4.5 bb/100 over 10000 hands in 182 s`.
- The tests in `tools/arena/*.test.ts` run under `npm test`.
- `match.ts` calls `dispose` on both bots after each hand; `worker.ts` and the in-process path of `run.ts` await
  `prepareBots([a, b])` first.

### Viewer

`web/tools/arena/ui/` is a second Vite app. In development (`npm run arena:ui`) it reads the runs in `resultsDir`
(or `ARENA_DIR`) through the dev server; `npm run build` also builds it into `dist/arena/` with base
`<BASE_PATH>arena/` and `web/arena-results/` as its public directory, so the published runs are served at
`<site>/arena/`. It imports from `src` only `game/records/record.ts`, `game/records/pokerstars.ts` and engine
types.

- `publish.ts`, `publishCli.ts` (`npm run arena:publish -- <run>...`): `publishRun` copies a report into
  `web/arena-results/` with `finishedAt` and `handsFile: '<name>.jsonl.gz'` (or null) and gzips its hands;
  `writeIndex` writes `index.json`, the `listRuns` of that directory. The directory is committed.
- `source.ts`: `sourceFor(dev, base)` gives the runs URL and hands URLs: the dev server API, or the published files.

- `server.ts`: `listRuns(dir)` returns every `*.json` report, newest first by `finishedAt` (file mtime for older
  reports), with its hands file (`handsFile`, or the same base name with `.jsonl` for older reports) when it exists
  in `dir`; `handsPath(dir, name)` accepts only a plain `*.jsonl` name of `dir`. `arenaPlugin(dir)` serves them as
  `GET /api/runs` and `GET /api/hands?file=`.
- `hands.ts`, `hands.worker.ts`, `handsClient.ts`: a Web Worker fetches the hands, gunzips them when they start
  with the gzip magic bytes (`decodeHands`, so a host that sent `Content-Encoding: gzip` works too), parses the
  JSONL, skips unreadable lines and keeps the raw lines for `record(line)`.
- `analysis.ts`: `summarize(record, line)` takes A's seat from the hand number (`k = (handNumber - 1) % 2`, A on
  seat `k`), so a bot against itself works, and the big blind of the hand from its `handStarted` event; the views
  show amounts in that big blind; `pairNets`, `cumulative` (at most 600 points), `slices` (position,
  street of the last action, showdown) and `pairRows`: a pair is kept when either hand passes the filter, its
  `matches` mark which, and a filtered list is sorted by the matching hands.
- Components: `App`, `RunList`, `RunView` (warns when the hands do not give the report's pairs and bb/100 of
  `summarize` in `stats.ts` within 0.05, and says so when the hands file holds no readable hand), `Curve`, `Slices`, `HandList`, `PairPanel` (both hands of a pair as PokerStars text). Tests run under
  happy-dom in the `ui` Vitest project.

## Conventions

- Chips are integers.
- Cards in fixtures and text are two-character strings: rank `23456789TJQKA`, suit `cdhs`.
- Tests sit next to the code as `*.test.ts` or `*.test.tsx`; golden tests are `*.golden.test.ts` and run only
  under `npm run test:golden`; timing tests are `*.bench.test.ts` and run only under `npm run bench`.
  `vitest.config.ts` extends `vite.config.ts` and has four Vitest projects: `npm test` runs `ui`, every test in
  `src/ui` and the `*.test.tsx` of `tools` under happy-dom, and `node`, the other tests once; `npm run test:golden`
  runs `golden` and `npm run bench` runs `bench`.
- Fixtures generated from the Java original live in `src/brains/fixtures/` and are written only by
  `web/tools/golden/run.sh`.
