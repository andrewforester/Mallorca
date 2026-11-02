# Coach panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In coach mode the table shows, at the player's turn, the strategy's hint for the player's hand, the
strategy grid of the player's seat, the bot's range grid and the numbers of the spot (equity, pot odds, MDF, bluff
share).

**Architecture:** A new pure layer `src/coach/` turns a CFR model, the hand's observations from the player's seat,
the legal actions, the pot and the bot's range into `CoachFacts`, plain data. The bot worker answers a new `coach`
request with them: it replays the observations into a fresh `CfrBot` in the player's seat for the hint and the
grid, and reads the range from the playing CFR brain. The session asks at every player turn while coach mode is on
and keeps the facts in its state; `ui` renders a `Coach` panel in the existing `coach` slot.

**Tech Stack:** TypeScript, Preact, zustand, Vitest, Playwright; the WASM exports of PR #46.

**Spec:** `docs/superpowers/specs/2026-10-31-coach-range-design.md`, delivery step 2.

## Global Constraints

- Branch `feat/coach-panel` stacked on `feat/coach-range-heatmap` (PR #46); the PR targets that branch until #46
  merges.
- No comments in code. ESLint limits: 400 lines per file, 60 per function, depth 3, complexity 12, 4 parameters, no
  cycles. A lint rule change (the `coach` layer) goes in its own commit.
- `coach` is pure (no DOM, timers, `Math.random`, storage) and may import `cards`, `equity`, `brains` and types from
  `engine` and `cfr`. `game` may also import `coach`.
- Pair index `b * (b - 1) / 2 + a` for `a < b`, as in `cfr`. Grid cell `row * 13 + col`, ranks from ace (0) to two
  (12); a pair on the diagonal, suited above it (row = higher rank), offsuit below.
- UI copy in `en.json` under `coach`: no all-caps words, no em or en dashes.
- Before every commit in `web/`: `npm run lint`, `npx tsc --noEmit`, `npm test`; `npm run test:golden` because
  `brains/index.ts` changes.

## Review Focus

- Coach mode switched on mid-hand: the facts must describe the whole hand, not only later actions. Pinned in Task 4
  by the stateless request (the session sends every observation of the hand).
- A stale reply (the player acted, a new hand started, coach switched off) must never overwrite newer facts. Pinned
  in Task 4.
- The math opponent: no range, equity against a random hand, hint and strategy grid still shown. Pinned in Tasks 3
  and 5.
- The fallback bot (worker failed): the panel says the coach is unavailable instead of spinning. Pinned in Task 4.
- The coach must not change the bot's play: the playing brain's RNG and observations are untouched. Pinned in Task 3.

---

### Task 1: `coach` layer rule

**Files:** Modify `web/eslint.config.js`, `web/src/brains/index.ts`.

- [ ] Add `coach` to `LAYERS` and `pure`; `layer('coach', ['cards', 'equity', 'brains'], ['engine', 'cfr'])`;
  `game` gains `coach`. Export `Spectrum`, `SpectrumEquilator` and `preflopStrengthVsSpectrum` from `brains/index.ts`.
- [ ] `npm run lint` passes; commit `build(web): the coach layer in the import rules`.

### Task 2: grid, equity and odds

**Files:** Create `web/src/coach/{grid,equity,odds,types}.ts` with tests beside them.

**Interfaces (produces):**
- `pairIndex(a, b)`, `cellOf(a, b): number`, `cellName(cell): string` (`AKs`, `AKo`, `AA`), `CELLS = 169`.
- `foldGrid(values: ArrayLike<number>, width: number, dead: Card[]): (number[] | null)[]`: per cell the mean of
  each of `width` columns over its live pairs, null when every pair is dead.
- `equityVsRange(hero: [Card, Card], board: Card[], weights: ArrayLike<number> | null): number`: null weights mean
  a random hand; pairs touching hero or board are skipped.
- `spotOdds(toCall: number, pot: number): SpotOdds | null` with
  `SpotOdds { toCall; requiredEquity: toCall / (pot + toCall); mdf: (pot - toCall) / pot; bluffShare: requiredEquity }`,
  null when `toCall` is 0; `pot` includes every bet on the table.

- [ ] Tests first: round trip of `pairIndex` and the cell layout (`As Ks` → `AKs` above the diagonal, `As Kd` →
  `AKo`, `As Ad` → `AA`, 169 cells hold 1326 pairs: 6 per pair cell, 4 per suited, 12 per offsuit);
  `foldGrid` means and nulls; `equityVsRange` against a one-hand range equals the head-to-head
  `SpectrumEquilator` value, against null weights equals the random-hand value, and preflop `AA` vs a `KK`-only
  range is above 0.8; `spotOdds(50, 150)` = `{ requiredEquity: 0.25, mdf: 2/3, bluffShare: 0.25 }`.
- [ ] Implement, run `npm test -- src/coach`, commit `feat(coach): grid, equity and odds`.

### Task 3: coach facts from a model

**Files:** Create `web/src/coach/facts.ts`, `web/src/coach/index.ts`; modify `web/src/cfr/brain.ts` (range on the
brain); tests `web/src/coach/facts.test.ts`, `web/src/cfr/cfr.test.ts`.

**Interfaces:**
- Consumes: `CfrModel.newBot()`, `CfrBot.spot`, `CfrBot.range` (PR #46); Task 2.
- Produces: `createCfrBrain` returns `CfrBrain = Required<Brain> & { range(): Float32Array | null }`.
- Produces: `coachFacts(request: CoachRequest): CoachFacts` with
  `CoachRequest { model: CfrModel; observations: Observation[]; legal: LegalActions; pot: number; range: ArrayLike<number> | null }`,
  `CoachFacts { hint: Hint | null; strategy: (number[] | null)[] | null; range: (number | null)[] | null; combos: number | null; equity: number; versus: 'range' | 'random'; odds: SpotOdds | null }`,
  `Hint { moves: CoachMove[]; mine: number[]; approximate: boolean; heroCell: number }`,
  `CoachMove { label: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allIn'; amount: number; tone: 'fold' | 'passive' | 'small' | 'large' | 'allIn' }`.
  A raise is `allIn` at `legal.raise.max`, `large` when its increment over the current bet is above 0.75 of the pot
  after the call, otherwise `small`; `bet` when `legal.call` is null.

- [ ] Tests first, on the shipped `cfr` model: aces on the button preflop give a hint whose `mine` sums to 1 and
  puts its largest share on a raise, a strategy grid of 169 cells with `heroCell` = `AA` and the hero's cell
  non-null; with `range: null` `versus` is `random` and `range` is null; with a range from a real bot after it
  opened, `versus` is `range` and the `AA` cell weight is above the `72o` weight; facing a bet `odds` is set;
  replaying the observations twice gives equal facts. In `cfr.test.ts`: a brain's `range()` before and after
  `decide` matches the bot's, and calling `range()` does not change the next decision for a fixed seed.
- [ ] Implement (replay with `mulberry32(handNumber)` draws, free the bot in `finally`), run, commit
  `feat(coach): coach facts from the strategy`.

### Task 4: worker request and session state

**Files:** Modify `web/src/game/{workerProtocol,workerHandler,bot.worker,botClient,session}.ts`; tests beside them.

**Interfaces:**
- `WorkerRequest` gains `{ kind: 'coach'; id; observations; legal; pot }`, `WorkerReply` gains `{ id; facts }`.
- `createWorkerHandler(newBrain, post, load, coachModel)` with `coachModel(opponent): Promise<CfrModel>` (`math` loads
  `cfr`); the handler reads `brain.range?.()` when the request arrives, then awaits the model and posts `facts` or
  `error`.
- `BotClient.coach?(observations, legal, pot): Promise<CoachFacts>`; `withFallback` forwards it to the active
  client and rejects after a fallback; `inProcessBot` has none.
- `SessionState` gains `coach: CoachState`, `{ status: 'off' | 'waiting' | 'ready' | 'unavailable'; facts: CoachFacts | null }`;
  `SessionActions` gains `setCoach(on: boolean)`; `SessionOptions` gains `coach?: boolean`.

- [ ] Tests first: the handler answers `coach` with facts after loading `cfr` for the math opponent and reads the
  range of a cfr brain; the session asks at every `humanToAct` while on, sends every observation of the hand from
  the player's seat (switching on mid-hand included), ignores a reply that arrives after the player acted or after
  `setCoach(false)` or a new hand, clears facts at a new hand, and shows `unavailable` when the client has no
  `coach` or it rejects.
- [ ] Implement, run, commit `feat(game): coach facts at the player's turn`.

### Task 5: coach panel

**Files:** Create `web/src/ui/Coach.tsx`, `web/src/ui/CoachGrid.tsx`, `web/src/ui/coachPhrases.ts`; modify
`Table.tsx`, `App.tsx`, `StatusBar.tsx`, `Settings.tsx`, `StartScreen.tsx`, `preferences.ts`, `usePreferences.ts`,
`styles/tokens.css`, `styles/layout.css`, `locales/en.json`, `game/index.ts`; tests beside them.

- [ ] Preference `mallorca.coach` (off unless stored `on`), menu checkbox `coach-mode`, start screen checkbox
  `start-coach`; `App` calls `setCoach` from it.
- [ ] `Coach` renders, from `CoachState`: the hint line (`coach-hint`, moves with percentages, a mixed-strategy
  sentence when two moves reach 10 %, an approximate note), tabs `coach-tab-hint`, `coach-tab-range`,
  `coach-tab-numbers` (role tab), the strategy grid `coach-strategy` (each cell split by move tone, the hero's
  cell outlined), the range grid `coach-range` (opacity by weight) or the math-bot sentence, and the numbers
  `coach-numbers`. Waiting, unavailable and not-your-turn states each have a line.
- [ ] Landscape: the panel sits in `.table-side`. Portrait: a status bar button `coach-toggle` (`aria-expanded`)
  opens it as a sheet over a scrim, closed by the button, Escape or the scrim.
- [ ] Colour tokens `--color-coach-fold`, `-passive`, `-small`, `-large`, `-all-in`, `-range` in light and dark,
  with contrast tests in `contrast.test.ts` if they carry text.
- [ ] Tests first for each component; run, commit `feat(ui): coach panel with hint, grids and numbers`.

### Task 6: e2e, docs, PR

- [ ] `e2e/coach.spec.ts`: with coach mode on and the `cfr` opponent, on phone and desktop, the hint and both grids
  appear at the player's turn; with `math` the range tab shows the math-bot sentence. `npm run contact`, look at
  both sheets with coach mode on.
- [ ] `ARCHITECTURE.md`: the `coach` layer and its imports, the worker request, `SessionState.coach`,
  `setCoach`, the preference, the panel and its test ids.
- [ ] Full pre-PR list; push; PR against `feat/coach-range-heatmap` referencing #5.
