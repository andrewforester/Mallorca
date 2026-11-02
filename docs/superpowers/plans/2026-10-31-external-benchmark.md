# External Benchmark against Slumbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play the CFR bot against Slumbot over its HTTP API, log every hand, and report bb/100 with a 95% interval
(raw, all-in EV, Slumbot baseline).

**Architecture:** A Node tool in `web/tools/arena/external/`. The Slumbot server owns the hand; our engine mirrors
it, rebuilt from scratch after every response, and gives the bot its observations and legal actions. A runner
appends one JSON line per hand; the estimator works on the log alone.

**Tech Stack:** TypeScript on Node 24 (runs `.ts` directly), Vitest, the existing `engine`, `brains`, `cards`,
`equity`, `cfr` modules and `tools/arena/bots.ts`.

**Spec:** `docs/superpowers/specs/2026-10-31-external-benchmark-design.md`

## Global Constraints

- No comments in code. ESLint limits per non-test file: 400 lines, 60 lines per function, depth 3, complexity 12,
  4 parameters, no import cycles.
- Before every commit, from `web/`: `npm run lint`, `npx tsc --noEmit`, `npm test`. Conventional commits with scope
  `arena` (`feat(arena): ...`); `git branch --show-current` is `feat/external-benchmark`.
- Slumbot: `https://slumbot.com/slumbot/api/`, blinds 50/100, stacks 20000, our bot always on engine seat 0.
- Tests never call the network: `fetch` is injected.
- Credentials only from `SLUMBOT_USERNAME`/`SLUMBOT_PASSWORD`; tokens never written to disk or stdout.

## Review Focus

1. An action string ending in `/` (street just dealt) or with empty streets after an all-in must parse; pinned in
   Task 1.
2. A short all-in (call for less, raise below the minimum) must mirror without throwing; pinned in Task 1 and 2.
3. A timed-out `act` must never be resent; pinned in Task 3.
4. A `winnings` mismatch must stop the run, not be averaged in; pinned in Task 4.
5. `--resume` on a log whose last line is cut mid-write must ignore that line, not crash; pinned in Task 4.

---

### Task 1: Action strings

**Files:**
- Create: `web/tools/arena/external/slumbot/actions.ts`
- Test: `web/tools/arena/external/slumbot/actions.test.ts`

**Interfaces:**
- Produces: `type SlumbotAction = { kind: 'k' | 'c' | 'f' } | { kind: 'b'; to: number }`;
  `parseActions(text: string): SlumbotAction[][]` (one array per street, trailing empty streets kept);
  `toEngineAction(a: SlumbotAction): Action` (`k` check, `c` call, `f` fold, `b` raise `to`);
  `toIncr(action: Action): string` (inverse).

- [ ] Tests: `parseActions('')` is `[[]]`; `'b200c/kk/kb200c/kb400c'` gives four streets with `{kind:'b',to:400}`
  last; `'b200c/kk/kk/'` gives four streets, the last empty; `'b20000c///'` gives four streets, three empty;
  `'ck/b100c/kk/kk'` round-trips through `toEngineAction` and `toIncr` per action; `parseActions('x')` throws.
- [ ] Run, see FAIL; implement; run, see PASS; lint, tsc; commit `feat(arena): Slumbot action strings`.

### Task 2: Mirror

**Files:**
- Create: `web/tools/arena/external/mirror.ts`
- Test: `web/tools/arena/external/mirror.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `interface MirrorInput { clientIsBigBlind: boolean; holeCards: [string, string]; board: string[];
  opponentCards: [string, string] | null; actions: SlumbotAction[][]; handNumber: number }`;
  `mirrorHand(input: MirrorInput): { step: Step; events: EngineEvent[] }`. Seat 0 is the client; button is seat 1
  when `clientIsBigBlind`. Stacks 20000, blinds 50/100. Deck: `[bbHole0, buttonHole0, bbHole1, buttonHole1,
  ...board]`, unknown slots filled with the lowest unused cards in `fullDeck` order. Throws `MirrorError` when an
  action is illegal or the street of the string disagrees with the engine.

- [ ] Tests (live fixtures from `/tmp/slumbot-probe/hands.json`, copied into tests as literals):
  `b200c/kk/kb200c/kb400c` with client BB, `Td4s`, board `Ah8d2sQd9s`, bot `Ac3s` ends `complete` with seat 0 at
  19200; `f` with client BB ends with seat 0 at 20050; `ck/kk/kk/kk` with client button `AcJs` vs `5h2s` on
  `7s6h5sKc3s` gives seat 0 19900; a mid-hand `b200c/kb` (flop known, bot cards unknown) leaves seat 0 to act on
  the flop facing a bet; a short all-in `b20000c///` with the full board ends `complete`; `b50` preflop (below
  the minimum raise) throws `MirrorError`.
- [ ] FAIL, implement, PASS, lint, tsc, commit `feat(arena): engine mirror of an external hand`.

### Task 3: Slumbot client

**Files:**
- Create: `web/tools/arena/external/slumbot/client.ts`
- Test: `web/tools/arena/external/slumbot/client.test.ts`

**Interfaces:**
- Produces: `interface SlumbotState { action: string; client_pos: 0 | 1; hole_cards: [string, string];
  board: string[]; bot_hole_cards?: [string, string]; winnings?: number; baseline_winnings?: number }`;
  `class AbandonedHand extends Error`; `class SlumbotError extends Error` (from `error_msg`);
  `createSlumbotClient(options: { fetch: typeof fetch; baseUrl?: string; credentials?: { username: string;
  password: string }; sleep?: (ms: number) => Promise<void> }): { newHand(): Promise<SlumbotState>;
  act(incr: string): Promise<SlumbotState> }`.
- Retry rule: a request is retried (pauses 1000, 2000, 4000, 8000, 16000 ms) only when `fetch` rejects with an
  error whose `cause.code` is `ECONNREFUSED`, `ENOTFOUND` or `EAI_AGAIN`; `new_hand` is also retried on 5xx. Any
  other failure of `act` throws `AbandonedHand`. After the last retry, the error is rethrown. Requests time out
  after 30 s (`AbortSignal.timeout`). The newest `token` is sent on every request; `login` runs once before the
  first `new_hand` when credentials are given.

- [ ] Tests with a fake `fetch` and `sleep` recording calls: token from response 1 is sent in request 2 and a
  changed token in response 2 is used in request 3; `ECONNREFUSED` twice then success makes three calls;
  a 503 on `act` throws `AbandonedHand` after exactly one call; a timeout (`AbortError`) on `act` throws
  `AbandonedHand` after one call; `error_msg` throws `SlumbotError` with its text after one call; login posts the
  credentials before `new_hand`; the returned state never contains `token`.
- [ ] FAIL, implement, PASS, lint, tsc, commit `feat(arena): Slumbot HTTP client`.

### Task 4: Runner and log

**Files:**
- Create: `web/tools/arena/external/runner.ts`, `web/tools/arena/external/log.ts`
- Test: `web/tools/arena/external/runner.test.ts`, `web/tools/arena/external/log.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3, `ArenaBot`/`BotFactory` from `tools/arena/bots.ts`, `handRecord` from
  `src/game/records/record.ts`.
- Produces: `interface ExternalLine { record: HandRecord | null; external: { opponent: 'slumbot'; clientPos: 0 | 1;
  action: string; holeCards: [string, string]; board: string[]; opponentCards: [string, string] | null;
  winnings: number | null; baselineWinnings: number | null; seed: number; handIndex: number; abandoned: boolean } }`;
  `readLog(text: string): ExternalLine[]` (skips a last line that does not parse); `appendLine(path, line)`;
  `runExternal(options: { client; bot: BotFactory; botVersion: string; hands: number; seed: number;
  out: string; delayMs: number; sleep? }): Promise<{ played: number; abandoned: number }>`. It starts from
  `handIndex = lines already in out`. The bot for decision `d` of hand `i` is seeded with
  `mulberry32((Math.imul(seed, 0x9e3779b1) + i * 64 + d) >>> 0)`. At the end of a hand it mirrors with
  `bot_hole_cards` and checks `stacks[0] - 20000 === winnings`; a mismatch appends the line and throws
  `WinningsMismatch`. Ten `AbandonedHand` in a row throw.

- [ ] Tests: a fake client replaying the six live hands (responses as literals, our actions forced by
  `always-call`-like bot that checks or calls) writes six lines with `abandoned: false`, `winnings` equal to the
  fixtures, `record.events` ending in `potAwarded`; a fake whose final `winnings` is off by 100 throws
  `WinningsMismatch` with the line written; an `AbandonedHand` on one `act` writes an abandoned line and the run
  continues; resume: running 3 hands then 3 more on the same file gives `handIndex` 0..5; `readLog` on text whose
  last line is `{"rec` returns the complete lines only.
- [ ] FAIL, implement, PASS, lint, tsc, commit `feat(arena): external match runner with a JSONL log`.

### Task 5: Estimate

**Files:**
- Create: `web/tools/arena/external/estimate.ts`, `web/tools/arena/external/allInEv.ts`
- Test: `web/tools/arena/external/estimate.test.ts`, `web/tools/arena/external/allInEv.test.ts`

**Interfaces:**
- Consumes: `ExternalLine` (Task 4), `pheEvaluator` from `src/equity`, `mirrorHand` (Task 2).
- Produces: `allInEvNet(line: ExternalLine): number` (chips; equal to `winnings` without an all-in before the
  river; else `equity * pot - committed[0]` with exact enumeration of the remaining board, ties split);
  `interface Estimate { bbPer100: number; ci95: number | null; sdPerHand: number; handsFor10: number | null }`;
  `estimate(lines: ExternalLine[]): { hands: number; abandoned: number; handsByPosition: { bigBlind: number;
  button: number }; raw: Estimate; allInEv: Estimate; baseline: Estimate }` with per-hand value
  `v = net / 100 * 100` in bb/100, `ci95 = 1.96 * sd / sqrt(n)` (sample sd, null for n < 2),
  `handsFor10 = ceil((1.96 * sd / 10)^2)`; baseline net is `winnings - baselineWinnings`.
  `formatEstimate(name: string, e): string` gives the line of the spec.

- [ ] Tests: AA vs KK all in preflop has `allInEvNet` within 0.5% of `0.8236 * 40000 - 20000` (exact value
  computed once and pinned); a turn all-in with 44 runouts matches a brute-force loop in the test; a hand with no
  all-in returns `winnings`; `estimate` on four hand-written lines gives the exact means and sds; the same lines
  give the same object twice; abandoned lines are counted and excluded.
- [ ] FAIL, implement, PASS, lint, tsc, commit `feat(arena): estimates of an external match`.

### Task 6: CLI, docs, fixtures

**Files:**
- Create: `web/tools/arena/external/cli.ts`, `web/tools/arena/external/cli.test.ts`,
  `web/tools/arena/external/README.md`
- Modify: `web/package.json` (script `"arena:external": "node tools/arena/external/cli.ts"` and
  `"prearena:external": "npm run wasm"`), `ARCHITECTURE.md` (an "external" subsection under "arena" and the
  directory table), `web/tools/arena/README.md` (one line linking the new README).

**Interfaces:**
- `parseArgs(argv: string[]): { mode: 'play'; opponent: 'slumbot'; hands: number; strategy: string; seed: number;
  out: string | null; resume: string | null; delayMs: number } | { mode: 'report'; file: string }`. Defaults:
  hands 1000, seed 1, delay 200, strategy `cfr`. Play writes to `resume`, else `out`, else
  `<resultsDir>/<botLabel>-slumbot-<YYYYMMDD-HHMMSS>.jsonl`; report writes `<file without .jsonl>.json` with
  `opponent`, `strategy`, `stackBb: 200`, the estimate, `commit` and `handsFile`, and prints `formatEstimate`.

- [ ] Tests: `parseArgs` defaults; unknown opponent or a bad number throws; `--report` mode.
- [ ] FAIL, implement, PASS; lint, tsc, test; commit `feat(arena): arena:external command`.

### Task 7: Live runs and results

- [ ] Smoke: `npm run arena:external -- --strategy cfr:<main>/solver/data/v2/v2-10-play.mlcs --hands 200`;
  every hand passes the `winnings` check.
- [ ] 2000 hands with `--resume`; `--report`; note the sds and `handsFor10`.
- [ ] Long run in the background with `nohup caffeinate -i` and `--resume` until the baseline `ci95 <= 10` or
  the projection says more than three nights.
- [ ] `solver/RESULTS.md`: a section "Slumbot (200 bb)" with the table row (strategy, hands, three figures,
  commit) and a rerun of `--report` giving the same numbers; commit `docs(solver): v2 against Slumbot`.
