# Architecture

One repository, two parts. The root holds the Java heads-up poker bot as an archive: it is not modified and it is
the reference the TypeScript port is checked against. `web/` is the browser game: a heads-up No-Limit Hold'em
cash game or tournament against a TypeScript port of the Mallorca math bot or the CFR blueprint trained in
`solver/`, built as a static site.

## Repository layout

| Path                                                                | Owns                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `MallorcaBrains/`, `MallorcaCore/`, `MallorcaEquilator/`, `Tools/`  | Java bot, game model and equilator; the source of the golden fixtures |
| Other Gradle modules (`MallorcaUI/`, `PokerRobot/`, `HHParser/`, …) | Java archive, not used by `web/`                                      |
| `web/src/`                                                          | The game, in layers (see "Layers")                                    |
| `web/src/locales/en.json`                                           | Every string the UI shows                                             |
| `web/e2e/`                                                          | Playwright tests and the contact sheet script                         |
| `web/scripts/preflop-table.ts`                                      | Regenerates `src/brains/data/preflop-strength.json`                   |
| `web/tools/golden/`                                                 | JVM harness that writes the golden fixtures, see its `README.md`      |
| `web/tools/arena/`                                                  | Node duplicate matches between two bots and their viewer, see "arena" |
| `web/scripts/wasm.ts`                                               | Builds `solver/crates/wasm` and copies it to `src/cfr/mallorca.wasm`  |
| `solver/`                                                           | Rust CFR trainer and the `mallorca-wasm` module, see its `README.md`  |
| `.github/workflows/`                                                | `web-ci.yml` on PRs; `web-deploy.yml`, `web-vercel.yml` on `master`   |

Generated and never committed: `web/dist`, `web/test-results`, `web/playwright-report`, `web/e2e/contact/`,
`web/tools/golden/build`, `web/arena-out/` (the arena results, see "arena") and `web/src/cfr/mallorca.wasm`, which `npm run wasm` builds with cargo
(the toolchain pinned in `solver/`) before `dev`, `test`, `build` and `arena`.

## Stack

Node 24, Vite, TypeScript strict, Preact, zustand, i18next, Vitest with `fast-check`, Playwright, ESLint
(typescript-eslint, `eslint-plugin-import-x`) and Prettier. Hand evaluation is `phe`, behind the `HandEvaluator`
interface.

## Layers

```
web/src/
  cards/    Card, parse and format ("As Kd"), seeded RNG, shuffle
  equity/   hand evaluation and equity
  engine/   heads-up NLHE rules as a pure reducer, table with a mode and its rules, hand history
  brains/   port of the Mallorca math bot
  cfr/      the CFR bot: the WASM module, the strategy file and a Brain over them
  game/     session store, turn loop, bot worker client, view-model, hand records
  ui/       Preact components, layout, tokens, i18n
```

| Layer    | May import from                       |
| -------- | ------------------------------------- |
| `cards`  | nothing                               |
| `equity` | `cards`                               |
| `engine` | `cards`, `equity`                     |
| `brains` | `cards`, `equity`, `engine`           |
| `cfr`    | `cards`, types from `engine`, `brains` |
| `game`   | `cards`, `equity`, `engine`, `brains`, `cfr` |
| `ui`     | `game`                                |

`brains` takes only types from `engine`: `Action`, `LegalActions` and the events it turns into observations.
`ui` imports only from `game`; for the table, `game` re-exports `Card`, `formatCard`, `rankOf`, `suitOf`,
`SeatIndex`, `LogEntry`, `HandCategory`, `TableMode`, `CASH` and `TOURNAMENT`, and for the history `HandRecord`,
`HandStore`, `openHandStore`, `memoryStore` and `toPokerStars`.

ESLint enforces the table with a `@typescript-eslint/no-restricted-imports` rule per directory. For `brains` the
rule sets `allowTypeImports` on `engine`; the tests in `brains` (`*.test.ts`) may also import `engine` code to
build events. `import-x/no-cycle` forbids import cycles inside `src`.

### Purity

`cards`, `equity`, `engine`, `brains` and `cfr` use no DOM, no `Math.random`, no `Date` and no `performance`. ESLint
enforces it with `no-restricted-globals` and `no-restricted-properties`. Randomness enters as an `Rng` argument.

## cards

- `Card` is a number 0..51, `rank * 4 + suit`. `rankOf` returns 2..14, `suitOf` returns 0..3 for `c d h s`.
- `parseCard("As")`, `parseCards("As Kd")`, `formatCard`, `fullDeck()`.
- `Rng` has `next(): number` in [0, 1). `mulberry32(seed)` implements it. `shuffle(items, rng)` is Fisher-Yates
  and returns a copy.

## equity

- `HandEvaluator` has `rank(cards)` for 5 to 7 cards, higher is better, and `category(rank)`, a `HandCategory`:
  `high-card`, `pair`, `two-pair`, `trips`, `straight`, `flush`, `full-house`, `quads`, `straight-flush`.
  `pheEvaluator` implements it over `phe`.
- `equityVsHand(hero, villain, board)` enumerates the remaining board exactly.
- `equityVsRange(hero, range, board, { rng, samples })` weighs a `WeightedHands` range: exact on the turn and river,
  seeded Monte Carlo on earlier streets.
- `streetEquity(hero, range, board)` returns `StreetEquity`: `strength`, `positivePotential` and
  `negativePotential` on a board of 3 to 5 cards. `realEquity` combines them.
- `src/equity/golden.test.ts`, part of `npm test`, checks `streetEquity` against 100 equities of the Java
  `PokerEquilatorBrecher`, within 0.02 on the flop and 0.01 on the turn and river.

## engine

- `createTable(names, mode, firstButton = 0)` (`table.ts`) returns a `Table`:
  `{ mode, seats, button, handNumber, hand, winner }`. A `Seat` is `{ name, stack }`. `TableMode` is
  `{ kind: 'tournament' }` (`TOURNAMENT`) or `{ kind: 'cash', bigBlind, buyIn }` (`CASH` is 20 and 2000). Both
  seats start with `TOURNAMENT_STACK` (2000) in a tournament and with `buyIn` in cash.
- `rulesOf(mode)` (`rules.ts`) returns the `Rules` of a mode: `blinds(handNumber)`, `beforeHand(seats)`, which
  returns the seats and events before the deal, and `isOver(seats)`, the winner or null. The table stays plain
  data; `startHand` and `apply` take the blinds, the top-up and the winner from the rules.
- `startHand(t, rng)` moves the button (the first hand uses `firstButton`, then it alternates), applies
  `beforeHand`, sets the blinds, shuffles and deals. `apply(t, action)` applies an `Action`: `fold`, `check`, `call` or `raise` with `to`.
  Both return `{ state, events }`. `legalActionsOf(t)` and `toAct(t)` read the current hand.
- `startHandWith(seats, { button, blinds, handNumber }, deck)`, `applyAction(hand, seats, action)` and
  `legalActions(hand, seats)` are the hand-level reducer; `applyAction` throws `IllegalActionError` for anything
  `legalActions` does not offer.
- `startHandWith` takes an already shuffled deck and deals from its front. Hole cards alternate starting with the
  seat after the button: `deck[0]` and `deck[2]` go to the big blind seat, `deck[1]` and `deck[3]` to the button.
  The board follows in order with no burn cards: flop `deck[4..6]`, turn `deck[7]`, river `deck[8]`. `Hand.deck`
  holds the undealt cards.
- `Hand.bets` is the street bet per seat, `committed` the total per seat for the hand, `pot` is the sum of
  `committed`. `canRaise` is false for a seat that faces a short all-in raise.
- `seats` stacks are the chips behind. `LegalActions` is `{ fold, check, call, raise }`: `call` is the amount the
  call adds, `raise` amounts are "raise to" the street total and `max` is all-in. `legalActions` returns no action
  when nobody is to act.
- Events: `toppedUp`, `handStarted`, `blindPosted`, `holeCards`, `acted`, `streetDealt`, `showdown`, `betReturned`,
  `potAwarded`, `handEnded`, `tournamentEnded`. `acted.amount` is the chips added to the pot by that action.
  `toppedUp { seat, amount }` comes before `handStarted`, so `handStarted.stacks` include it; `toObservations`
  ignores it.
  `showdown.hands` is indexed by seat; `cards` are the hole cards.
- When a hand ends, `street` is `complete`, `toAct` is null, `pot` is 0 and the stacks include the awarded pot.
- `startHand` and `apply` both end the tournament when a hand completes with an empty stack: they set `winner` and
  append `tournamentEnded`. A cash table never ends and never emits `tournamentEnded`. A hand can complete inside `startHand` when a short stack is all-in from the blinds.
- `handHistory(events)` returns `LogEntry` values, `{ key, params }`, with seat indices in `params.seat` and no
  names or English text. `key` is a locale key under `log` (with `you` or `other` for entries that have a seat);
  `params.category` is a `HandCategory`.

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
| `villainModel.ts`      | `VillainModel`, `randomVillainModel`, `VillainSpectrumTracker`                   |
| `strength.ts`          | `StrengthManager`: hero equity per street against the spectrum and at random     |
| `spectrumEquilator.ts` | `SpectrumEquilator`: hero strength against a spectrum on a board, with its cache |
| `preflopEquilator.ts`  | Preflop strength from `data/preflop-strength.json`                               |
| `solver.ts`            | `NLGameSolver`, `ShowdownGameSolver`: the game tree, as `SolverNode`s            |
| `profit.ts`            | `profitMap`, `SolverRequest`, `HeroKnowledge`, `RandomVariable`, raise sizing    |
| `adviceFromMap.ts`     | `LessVarianceActionFromMap`: picks the action class from the action distribution |
| `preprocess.ts`        | `preprocessAction`, `toLegalAction`: resizes and clamps the chosen action        |
| `brain.ts`             | `createMathBrain`, `Brain`, `Decision`                                           |
| `javaCard.ts`          | The Java card numbering, for hashes that must match the original                 |

- `Observation` is the bot's view of engine events: `handStarted` (hand number, `heroOnButton`, both stacks,
  blinds), `holeCards` (its own), `acted` (`who` is `hero` or `villain`, the `Action` and the chips added) and
  `street` with the board. `toObservations` drops the villain's hole cards and the showdown.
- `createMathBrain({ villainModel })` returns a `Brain` with `observe(o)` and `decide(legal)`. It enumerates
  equities exactly and takes no `Rng`.
- `randomVillainModel` returns the probabilities the Java `RandomBot` samples from: facing a bet fold, passive and
  aggressive 1/3 each, otherwise passive and aggressive 1/2 each. It is never sampled.
- `profitMap(solver, game, situation, knowledge)` builds the `ActionDistribution`; `knowledge` is the
  `HeroKnowledge` (`hero`, `spectrum`, `strength`). The solver gets one `SolverRequest` per call (game, hand
  state, effective stack, pot, spectrum, hero, strength, button).
- `decide` returns `{ action, solverChoice, evByAction }`. `action` is always legal under `legal`. `solverChoice`
  is the class (`fold`, `passive`, `aggressive`) the advice creator picked, before preprocessing and clamping.
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
  gzipped: all four streets, the flop bucket table and the turn and river thresholds. `mallorca.wasm` is
  `solver/crates/wasm`, a plain `extern "C"` ABI over `mallorca-core::bot`; it imports nothing.
- `inflate(bytes)` gunzips with `DecompressionStream` when the bytes start with the gzip magic and returns other
  bytes as they are. `createCfrModel(wasm, strategy)` instantiates the module and loads the strategy; a bad file
  rejects with the reader's reason. `model.newBot()` returns a `CfrBot` handle, freed with `free()`.
- `createCfrBrain(model, rng)` is a `Brain` with `dispose()`. It forwards every `Observation` to the bot and draws
  one `rng.next()` per observed action (the off-tree raise mapping) and one per decision (sampling the strategy),
  so a seed fixes its play. `solverChoice` is the kind of the action; `evByAction` is `NaN` for every class.
- Translation lives in Rust (`mallorca-core::bot`): chips scale by the big blind, an opponent raise maps to one of
  the two neighbouring tree sizes by the pseudo-harmonic mapping on pot fractions, the bot's own raise keeps the
  tree's pot fraction and is clamped into `legal.raise`, and a hand that leaves the tree resyncs to the nearest
  decision node of the same street, seat and facing-a-bet state.

## game

- `createSession({ bot, seed, botDelayMs, humanSeat, names, mode, startingStacks?, records? })` returns a
  zustand store with `SessionState` (its engine state is `table`) and the actions `start(mode?, opponent?)`,
  `nextHand`, `act(intent)`, `leave` and `dispose`. `start(mode)` replaces the session's mode for this and later
  starts; `start()` keeps the current one. `opponent` (`math` or `cfr`, `OPPONENTS` in `opponent.ts`) works the
  same way: when it differs from the current one, `start` first awaits `bot.select(opponent, seed)` and
  `SessionState.opponent` becomes the opponent the bot answered with; hand records carry its id (`math` version
  `1`, `cfr` version `v1-18`). `seed` drives `mulberry32` for every shuffle. The actions are module functions
  over one shared `Runtime` per session: the store accessors, the bot, the RNG, the timers, the hand recorder, the
  mode, the session tally and an epoch that `start` and `dispose` advance.
- `phase` is one of `idle` (before `start`), `humanToAct`, `botThinking` (waiting for `decide`), `animating`
  (the `botDelayMs` pause before the bot's action is applied), `handOver`, `tournamentOver` and `sessionOver`.
  `act` is ignored unless the phase is `humanToAct`, and `nextHand` unless it is `handOver`. `leave` moves a cash
  session from `handOver` to `sessionOver`, where `act` and `nextHand` do nothing; in any other mode or phase it
  is ignored.
- `session` is `{ hands, net }` for the human seat: `hands` counts completed hands and
  `net = stack - buyIn - top-ups` in chips, where `buyIn` is the mode's in cash and 2000 in a tournament and
  top-ups are the human's `toppedUp` amounts since `start`. Mid-hand `net` uses the stack at the start of the hand
  (after any top-up, blinds included), so it changes only when a hand completes.
- Turn loop: after each step the session forwards the events to the bot as observations, then either waits for
  the human or asks the bot to decide and applies its action after `botDelayMs`.
- `Intent` is `fold`, `passive` (check or call) or `raise` with a target. `resolveIntent` turns it into a legal
  action: a raise is rounded and clamped into `legal.raise`, a fold becomes a check when checking is free.
- `log` holds the `LogEntry` values of the session. `lastActions` holds one tag per seat for the current hand,
  `{ key, params }` with `key` under `actions` (`fold`, `check`, `call`, `raiseTo`, `allIn`).
- `result` is set when a hand completes: `winner` (null for a split), `category` of the shown hand or null,
  `showdown` and `amount`. `amount` is the pot collected, twice the smaller contribution, or each share for a
  split. It equals the `win` entry of the log; an uncalled bet is its own `returned` entry.
- `BotClient` has `observe(observations)`, `decide(legal)`, `reset()`, an optional `select(opponent, seed)` and an
  optional `dispose()`. `workerBot()` runs the brain in `bot.worker.ts` over the `WorkerRequest` and `WorkerReply`
  messages in `workerProtocol.ts`; `createWorkerHandler(newBrain, post, load?)` in `workerHandler.ts` is the
  worker's message handling as a plain function. A `select` request queues every later request until the
  opponent's brain factory is ready, then replies `{ id, opponent }` or `{ id, error }` and keeps the old brain on
  an error. The worker loads the CFR model once (`fetch` of the two `new URL(..., import.meta.url)` assets) and
  seeds its brains with `mulberry32(seed)`. Replacing a brain disposes it. `inProcessBot()` runs the math brain on
  the main thread and rejects `select('cfr')`.
- `withFallback` wraps a client: when `decide` rejects or takes longer than 5 s, it disposes the primary, replays
  the observations of the hand into an in-process bot and uses it from then on. It falls back once, and a failure
  from before `reset` or `dispose` does not trigger it. The session drops a decision that arrives after `start`
  or `dispose`.
  Its `select` answers `math` without asking a client that has no `select`; when the client's `select` rejects or
  takes longer than 60 s, it falls back the same way and answers `math`.
- `toViewModel(state, humanSeat)` returns the `ViewModel`: per seat the name, stack, street bet, button, whether
  it is to act, the cards (`'back'` for the bot's cards until a showdown) and the last action tag; the board, pot,
  blinds (from `rulesOf(mode).blinds`) and hand number; the `mode` (`cash` or `tournament`); `session` with
  `hands`, `netBb` and `bbPer100` (one decimal, `bbPer100` null with no hands); the controls (`fold`, `passive`
  with its amount, `raise` with `min`, `max` and the presets `halfPot`, `pot` and `allIn`, and `enabled`); the
  result and the tournament winner.
- `SessionOptions.records` is `{ store, sessionId, now }`; without it nothing is recorded and `sessionId` in the
  state is null. `records/recorder.ts` collects the events of each hand from `beginHand` on and, when the hand
  completes, calls `store.add(handRecord(...))` without awaiting it; a rejection, a synchronous throw or a failing
  `now()` is ignored and the game goes on. A bot `Decision` is recorded with `recordDecision`; its `eventIndex` is
  the index of the resulting `acted` event in the hand's events. The timeout fallback plays without a decision
  and records none. `bot` is `MATH_BOT`, `playedAt` is `now()` at completion.
- `simulation.test.ts` plays full tournaments between the bot and a seeded random human through the session and
  checks that chips are conserved, the session never stalls and the winner holds every chip.

### Hand records

`game/records/` is named apart from the engine's `handHistory` log.

- `HandRecord` (`record.ts`), version 1: `id` (`<sessionId>-<handNumber>`), `sessionId`, `mode`, `handNumber`,
  `playedAt` (ISO time), `names`, `humanSeat` (null for arena hands, where both seats are bots), `bot`
  (`{ id, version }`), `holeCards` of both seats and `board` as two-character strings, every engine `events` of
  the hand from `toppedUp` on, and `decisions` (`{ eventIndex, solverChoice, evByAction }`, a non-finite EV
  stored as null since JSON has no infinity). `handRecord(events, decisions, meta)` is pure; the caller passes
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
- Components: `App`, `StatusBar`, `HistoryMenu`, `StartScreen`, `Table`, `Seat`, `Card` (SVG), `Board`, `Pot`,
  `ActionBar`, `BetSlider`, `HandLog`, `TournamentOver`, `SessionOver`.
- The start screen offers a cash game (100 bb) and a tournament. In cash the status bar shows the blinds, the
  running result in bb and a leave button, enabled only between hands; the session-over dialog shows the result in
  bb, bb/100 and the hands, with play again and the export of the session. `signed` formats a bb value as sign
  and one-decimal absolute value.
- Layout: portrait for phones (bot at the top, the human's cards and controls at the bottom), landscape for wide
  screens with the hand log at the side, switched by a `min-aspect-ratio: 1/1` media query. The `coach` panel is
  the slot for a later training mode and is empty.
- Every colour, font, radius, spacing and shadow is a CSS token on `:root` in `ui/styles/tokens.css`, with a dark
  theme under `prefers-color-scheme: dark`. The visual design brief is GitHub issue #2.
- Every string comes from `src/locales/en.json` through i18next (`ui/i18n.ts`). `ui/phrases.ts` words log
  entries, action tags and hand categories; an entry with the human seat uses the `log.you` keys, any other seat
  the `log.other` keys with `{{name}}`.
- `main.tsx` picks a random seed per game and reads two query parameters: `?seed=<n>` fixes the seed and
  `?botDelay=<ms>` sets the bot pause (700 ms by default). The human sits in seat 0.
- History: `main.tsx` awaits `openHandStore()` once, gives every `mount()` a fresh `crypto.randomUUID()` session
  id and passes the store to `App`. The menu exports every hand as JSON or text and clears the history after a
  second click on the same button. `ui/history.ts` reads the store and calls `ui/download.ts` (a Blob and a
  temporary anchor, the object URL revoked after the click) with `mallorca-<sessionId>.json|txt` or
  `mallorca-history.json|txt`; store errors are ignored. Plural copy such as `session.summary_one` and `_other`
  is resolved by i18next from `count`.
- Keyboard: `f` folds, `c` checks or calls, `r` raises, the arrow keys move the raise amount.
- `data-testid` contract for e2e and contact sheets: `start-cash`, `start-tournament`, `blinds`,
  `session-result`, `hand-number`, `leave`, `new-game`, `seat-<i>`, `stack-<i>` (with `data-stack`), `bet-<i>`, `action-<i>`, `thinking-<i>`, `card` (with
  `data-card`), `card-back`, `board`, `pot` (with `data-amount`), `result`, `next-hand`, `fold`, `passive`,
  `raise`, `raise-amount`, `preset-half`, `preset-pot`, `preset-allin`, `hand-log`, `coach`, `live-region`,
  `tournament-over`, `session-over`, `session-summary`, `session-rate`, `play-again`, `export-json` and
  `export-text` (the session dialog, current session), and `export-all-json`, `export-all-text` and
  `clear-history` (the menu).

## e2e

- Playwright runs against the production build (`vite preview`) on three projects: `phone` 390 × 844,
  `small-phone` 360 × 740 and `desktop` 1440 × 900.
- `game.spec.ts`: a passive hand keeps the chips, all-in every hand ends the tournament and "Play again" returns
  to a fresh table, a reload mid-hand shows the start screen, a cash hand is played and left with one hand in the
  summary, and the hand history is exported, persists across a reload and is cleared. `layout.spec.ts`: the start
  screen, the table, the cash table, the session summary and a cash status bar with long values fit the viewport
  without horizontal scroll.
- `e2e/contact.ts` (`npm run contact`) captures every view state of a seeded game on `phone` and `desktop` and
  composes one sheet per device into `e2e/contact/`.

## arena

`web/tools/arena/` is a Node script outside the app bundle, run as `npm run arena -- --a <bot> --b <bot>`. It
imports `engine`, `brains`, `cards` and `game/records/record.ts` and nothing from `ui`; Node 24 runs the `.ts`
files directly, including in workers. `tools/` may use the clock and Node APIs.

- `bots.ts`: `BOTS`, the `BotFactory` (`(rng) => ArenaBot` with `observe`, `decide` and an optional `dispose`)
  of each name: `math` (`createMathBrain` with `randomVillainModel`), `cfr` (`createCfrBrain` over the model that
  `prepareBots` loads from `src/cfr` once per process or worker; it throws before that), `always-call` (checks or calls), `always-raise` (raises to
  `legal.raise.min` when it can, else checks or calls) and `random` (uniform over the legal kinds, a raise to the
  minimum, from its seeded `Rng`).
- `match.ts`: `playPair(a, b, seed, index)` plays one deck twice with the seats swapped: the deck is shuffled by
  `mulberry32((Math.imul(seed, 0x9e3779b1) + index) >>> 0)`; hand `k` (0, 1) starts both seats at 2000, button
  seat 0, blinds 10/20, `handNumber = index * 2 + k + 1`, with `a` on seat 0 in hand 0 and `b` in hand 1. Each hand
  gets fresh bots, the bot on `seat` seeded by `mulberry32((seed ^ (index * 4 + k * 2 + seat)) >>> 0)`, and each
  bot receives `toObservations` of the new events for its seat after every step. It returns `net`, the chips of
  `a` over both hands, and the events of both hands. The math bot against itself nets exactly 0 per pair.
- `stats.ts`: `summarize(nets, bigBlind)`. The per-pair value is `v = net / 2 / bigBlind * 100`; `bbPer100` is the
  mean of `v` and `ci95 = 1.96 * sd(v) / sqrt(n)` with the sample standard deviation (n - 1). With fewer than 2
  pairs `ci95` is `Infinity`, and null in the report. `hands = 2 * pairs`.
- `paths.ts`: `resultsDir(cwd, env)` is `ARENA_DIR` resolved against `cwd`, else `web/arena-out` of the main
  checkout (the parent of `git rev-parse --git-common-dir`, shared by every worktree), else `<cwd>/arena-out`.
  `runName(a, b, pairs, seed, started)` is `<a>-<b>-<pairs>-s<seed>-<YYYYMMDD-HHMMSS>` in UTC.
- `run.ts`: `runArena({ a, b, pairs, seed, workers, saveHands?, reportDir? })` splits the pair indices into contiguous chunks,
  runs them in process (`workers: 1`) or in `worker_threads` (`worker.ts`), gathers the results in index order and
  returns the `Report` (`a`, `b`, `pairs`, `hands`, `seed`, `bbPer100`, `ci95`, `durationMs`, `commit` from
  `git rev-parse --short HEAD` or `unknown`, `finishedAt`, and `handsFile`, the `saveHands` path relative to
  `reportDir`, or null); the result depends only on the seed, not on the worker count.
  `saveHands` writes one `HandRecord` per line (JSONL) with `humanSeat: null`, `sessionId: arena-<seed>`,
  `bot: { id: '<a>-vs-<b>', version: '1' }` and a `playedAt` one second apart per hand from the start of the run.
- `cli.ts`: flags `--a`, `--b`, `--pairs` (1000), `--seed` (1), `--workers` (`os.availableParallelism()`),
  `--dir <path>` (`resultsDir` by default), `--out <file>`, `--save-hands <file>` and `--no-hands`. Every run is
  saved: the report to `--out` or `<dir>/<runName>.json`, the hands to `--save-hands` or `<dir>/<runName>.jsonl`
  unless `--no-hands`. An unknown bot or a bad number exits with code 1. It prints the report path on stderr and
  one line on stdout: `a vs b: +12.3 ± 4.5 bb/100 over 10000 hands in 182 s`.
- The tests in `tools/arena/*.test.ts` run under `npm test`.
- `match.ts` calls `dispose` on both bots after each hand; `worker.ts` and the in-process path of `run.ts` await
  `prepareBots([a, b])` first.

### Viewer

`web/tools/arena/ui/` is a second Vite app, `npm run arena:ui`, never built into `dist`. It reads the runs in
`resultsDir` (or `ARENA_DIR`) and imports from `src` only `game/records/record.ts`, `game/records/pokerstars.ts` and
engine types.

- `server.ts`: `listRuns(dir)` returns every `*.json` report, newest first by `finishedAt` (file mtime for older
  reports), with its hands file (`handsFile`, or the same base name with `.jsonl` for older reports) when it exists
  in `dir`; `handsPath(dir, name)` accepts only a plain `*.jsonl` name of `dir`. `arenaPlugin(dir)` serves them as
  `GET /api/runs` and `GET /api/hands?file=`.
- `hands.ts`, `hands.worker.ts`, `handsClient.ts`: a Web Worker fetches and parses the JSONL, skips unreadable
  lines and keeps the raw lines for `record(line)`.
- `analysis.ts`: `summarize(record, line)` takes A's seat from the hand number (`k = (handNumber - 1) % 2`, A on
  seat `k`), so a bot against itself works; `pairNets`, `cumulative` (at most 600 points), `slices` (position,
  street of the last action, showdown) and `pairRows` (filter and sort pairs).
- Components: `App`, `RunList`, `RunView` (warns when the hands do not give the report's pairs and bb/100 within
  0.05), `Curve`, `Slices`, `HandList`, `PairPanel` (both hands of a pair as PokerStars text). Tests run under
  happy-dom in the `ui` Vitest project.

## Conventions

- Chips are integers.
- Cards in fixtures and text are two-character strings: rank `23456789TJQKA`, suit `cdhs`.
- Tests sit next to the code as `*.test.ts` or `*.test.tsx`; golden tests are `*.golden.test.ts` and run only
  under `npm run test:golden`.
- Fixtures generated from the Java original live in `src/equity/fixtures/` and `src/brains/fixtures/` and are
  written only by `web/tools/golden/run.sh`.
