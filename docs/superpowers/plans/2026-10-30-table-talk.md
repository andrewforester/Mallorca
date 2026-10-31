# Table Talk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mallorca chats with the player through an LLM, with code-decided tells, a mood that follows the session and the player's words, and a bounded style shift of the CFR bot.

**Architecture:** A pure layer `web/src/talk` decides when she speaks, the intent of each line, her mood and the style; `mallorca-core::bot` reweights the blueprint by that style; a Supabase Edge Function `talk` only words lines and reads signals from the player's text; `game` wires it together without ever waiting for the server.

**Tech Stack:** Rust (`solver/`), TypeScript, Preact, zustand, Vitest, fast-check, Playwright, Supabase (Postgres, Auth, Edge Functions on Deno), `@supabase/supabase-js`, `npm:@anthropic-ai/sdk`.

**Spec:** `docs/superpowers/specs/2026-10-30-table-talk-design.md` (issue #23). Decision numbers below refer to it.

## Global Constraints

- Read the repository `CLAUDE.md`, `ARCHITECTURE.md` and, for Rust, `solver/CLAUDE.md` before the first change.
- No comments in code or config, in any language.
- ESLint limits on non-test files in `web/src`: 400 lines per file, 60 per function, depth 3, complexity 12, 4 parameters, no import cycles. `web/src/game/session.ts` is at 371 lines: talk wiring goes into new modules.
- `src/talk` is pure: no DOM, no `Math.random`, no `Date`, no `performance`. Randomness is an `Rng` argument, time a `nowMs` argument.
- UI copy: no all-caps words, no em or en dashes as sentence punctuation. Every UI string lives in `web/src/locales/en.json`.
- Before every commit in `web/`: `npm run lint`, `npx tsc --noEmit`, `npm test` (after `source ~/.nvm/nvm.sh && nvm use`). Rust: `cargo fmt --all --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` from `solver/` with `~/.cargo/bin` on `PATH`. Deno: `deno fmt --check`, `deno lint`, `deno test` from `supabase/functions`.
- TDD: the failing test first. Never weaken a test, loosen a tolerance or add a suppression.
- Conventional commits with the layer as scope (`feat(talk): ...`, `feat(solver): ...`, `feat(server): ...`), each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `feat/table-talk`; never push to `master`.
- Model id default `claude-haiku-5-5`. Never put a model id in code comments, commit messages or docs other than as this config default.

## Review Focus

1. A line that arrives after its street, its hand or the session ended must be dropped, never shown on the wrong street (Task 11 test `drops a stale line`).
2. The player's text can be empty, whitespace, over 200 characters or a prompt injection asking for her cards: the client trims and caps it, the server rejects over-long text with 400, and the card filter still applies (Tasks 8, 9, 12 tests).
3. Talk switched off, or a missing Supabase config, or a failed anonymous sign-in, must leave the game exactly as today: no network calls from `say`, no chat UI (Tasks 10, 11, 12 tests).
4. A style passed to the math bot or to a worker that fell back to the math bot is ignored without error (Task 2 test `math brain ignores style`).
5. A hand that ends preflop by a fold, a split pot, and an all-in runout must all update mood and form correctly, with luck only for the all-in case (Task 5 tests).

---

### Task 1: Style knobs in the CFR bot (Rust and WASM)

**Files:**
- Create: `solver/crates/core/src/bot/style.rs`
- Modify: `solver/crates/core/src/bot/mod.rs` (field on `Bot`, use in `decide`), `solver/crates/wasm/src/lib.rs`
- Test: `solver/crates/core/src/bot/tests.rs`, `style.rs` unit tests

**Interfaces:**
- Produces: `pub struct Style { pub aggression: f64, pub bluff: f64, pub tightness: f64 }` with `Style::NEUTRAL` (all 1.0) and `Default`; `pub fn reweight(probabilities: &[u8], kinds: &[ActionKind], style: &Style, low_bucket: bool, late_street: bool) -> Vec<f64>`; `pub fn sample_weighted(weights: &[f64], draw: f64) -> usize`; `Bot::set_style(&mut self, style: Style)` (kept across `hand_started`); WASM `#[no_mangle] pub extern "C" fn bot_style(bot: i32, aggression: f64, bluff: f64, tightness: f64)`.

- [ ] **Step 1: Write failing unit tests in `style.rs`**
  - `neutral_style_keeps_weights`: `reweight(&[100, 55, 100], &[Fold, Call, RaiseTo(x)], &Style::NEUTRAL, false, false)` equals `[100.0, 55.0, 100.0]`.
  - `aggression_moves_mass_to_raises`: with aggression 1.25 the raise share rises and the call share falls versus neutral; with 0.8 the reverse.
  - `tightness_scales_fold`: fold weight times 1.2.
  - `bluff_only_low_buckets_late`: bluff 1.3 raises the raise share only when `low_bucket && late_street`.
  - `sample_weighted_matches_cumulative`: draws 0.0, 0.5, 0.999 land in the expected slots; zero weights are never chosen.
- [ ] **Step 2: Run `cargo test -p mallorca-core style`**, expect compile failure.
- [ ] **Step 3: Implement `style.rs`**: bets, raises and all-ins (`RaiseTo`, `AllIn`) times `aggression`, `Check` and `Call` divided by it, `Fold` times `tightness`, aggressive kinds also times `bluff` when `low_bucket && late_street`. `sample_weighted` walks cumulative weights with `draw * total`.
- [ ] **Step 4: Write failing integration tests in `bot/tests.rs`**
  - `neutral_style_plays_the_blueprint`: a property test over random spots and draws, the same harness as the existing legality property; a bot with `set_style(Style::NEUTRAL)` returns exactly the move of a bot without it.
  - `aggressive_style_raises_more`: over 2,000 seeded decisions at one flop spot, the count of raises with aggression 1.25 is above the neutral count.
- [ ] **Step 5: Use the style in `decide`**: when the style equals `Style::NEUTRAL`, keep the current `sample(probabilities)` path; otherwise `reweight` and `sample_weighted`. `low_bucket` is `bucket < 0.35 * buckets[street]` on turn and river (`model.file.tree.buckets()`), `late_street` is turn or river. `pending` still points to the chosen child.
- [ ] **Step 6: Add `bot_style` to the WASM crate** with the same handle checks as `hole_cards`.
- [ ] **Step 7: Run fmt, clippy, `cargo test`, and `cargo build -p mallorca-wasm --target wasm32-unknown-unknown --release`.** All pass.
- [ ] **Step 8: Commit** `feat(solver): style knobs in the bot (issue #23)`.

### Task 2: Style through the worker, the brains and the records

**Files:**
- Modify: `web/src/cfr/model.ts` (`Exports.bot_style`, `CfrBot.setStyle`), `web/src/cfr/brain.ts`, `web/src/brains/brain.ts`, `web/src/game/workerProtocol.ts`, `web/src/game/workerHandler.ts`, `web/src/game/botClient.ts`, `web/src/game/records/record.ts` (and the recorder), `web/tools/arena/bots.ts` (type only if needed)
- Test: `web/src/cfr/cfr.test.ts`, `web/src/game/workerHandler.test.ts`, `web/src/game/botClient.test.ts`, record tests

**Interfaces:**
- Consumes: WASM `bot_style` (Task 1).
- Produces: in `brains/brain.ts` `export interface BotStyle { aggression: number; bluff: number; tightness: number }` and `Brain.setStyle?(style: BotStyle): void`; `CfrBot.setStyle(style: BotStyle): void`; `WorkerRequest` decide gains `style?: BotStyle`; `BotClient.decide(legal: LegalActions, style?: BotStyle): Promise<Decision>`; `RecordedDecision.style?: BotStyle`; the recorder's `decided` takes the style.

- [ ] **Step 1: Failing tests**
  - `cfr.test.ts` `setStyle reaches the module`: with the real wasm, a brain with aggression 1.25 raises more often than neutral over 500 seeded flop decisions.
  - `workerHandler.test.ts` `passes the style before decide`: a fake brain with `setStyle` records the style, then `decide` is called.
  - `workerHandler.test.ts` `math brain ignores style`: a brain without `setStyle` decides normally.
  - `botClient.test.ts` `fallback ignores style`: after a worker timeout the math fallback still answers a decide with a style.
  - record test: a decision with a style is saved with it, one without has no `style` key.
- [ ] **Step 2: Run** `npx vitest run src/cfr src/game` and see them fail.
- [ ] **Step 3: Implement**, keeping `decide(legal)` without a style working everywhere.
- [ ] **Step 4: Run** lint, tsc, `npm test`, `npm run test:golden`. Pass.
- [ ] **Step 5: Commit** `feat(game): pass the bot style to the CFR brain (issue #23)`.

### Task 3: Talk layer, strength and habits

**Files:**
- Create: `web/src/talk/strength.ts`, `web/src/talk/habits.ts`, `web/src/talk/index.ts`
- Modify: `web/eslint.config.js` (add `talk` to `LAYERS` and `pure`, `layer('talk', ['cards', 'equity'], ['engine'])`, tests may import `engine`; allow `talk` in `game`), `ARCHITECTURE.md` (layer table)
- Test: `web/src/talk/strength.test.ts`, `web/src/talk/habits.test.ts`

**Interfaces:**
- Produces:
  - `type StrengthClass = 'strong' | 'medium' | 'weak'`; `strengthOf(hole: readonly [Card, Card], board: readonly Card[], rng: Rng): StrengthClass` (decision 2: equity against a random hand, exact on the river, 400 Monte Carlo samples before; preflop strong at ≥ 0.62, postflop at ≥ 0.75, weak below 0.45 everywhere).
  - `type Situation = 'herBet' | 'herCall' | 'playerBet' | 'handWon' | 'handLost' | 'bluffCaught'`; `type Level = 'obvious' | 'subtle' | 'hidden'`; `interface Habit { speak: number; honest: number }`; `type Habits = Record<Situation, Record<StrengthClass, Habit>>`; `BASE_HABITS: Habits` with the values of decision 3 (for `handWon`, `handLost`, `bluffCaught` every class gets the listed `speak` and `honest` 0.5; `herCall` 0.2 and 0.5).
  - `habitsAt(habits: Habits, level: Level): Habits`: decision 4, moving each value toward neutral by 0, 0.5 or 0.9.
- [ ] **Step 1: Failing tests**: `As Ah` preflop is strong, `7c 2d` preflop is weak, a made nut flush on the river is strong, a missed draw on the river is weak; the same seed gives the same class; `habitsAt(BASE_HABITS, 'obvious')` equals the base; on `hidden` every situation's `speak` values differ by at most 0.1 × the base spread and every `honest` is within 0.05 of 0.5; `subtle` is exactly halfway.
- [ ] **Step 2: Run** `npx vitest run src/talk`, fail.
- [ ] **Step 3: Implement**, using `equityVsRange` with a uniform `WeightedHands` of all live two-card hands.
- [ ] **Step 4: Run** lint, tsc, tests. Pass.
- [ ] **Step 5: Commit** `feat(talk): strength class and habits (issue #23)`.

### Task 4: Mood and style

**Files:**
- Create: `web/src/talk/mood.ts`, `web/src/talk/style.ts`
- Test: `web/src/talk/mood.test.ts`, `web/src/talk/style.test.ts`

**Interfaces:**
- Produces:
  - `type Signal = 'tease' | 'compliment' | 'claimStrength' | 'claimWeakness' | 'mockBluff' | 'friendly'`; `SIGNALS: readonly Signal[]`.
  - `interface Mood { cheer: number; confidence: number; tilt: number; caution: number; form: number }`; `CALM: Mood` (all 0).
  - `interface Outcome { netBb: number; luckBb: number | null; bluffCaught: boolean }`.
  - `afterHand(mood: Mood, outcome: Outcome): Mood` (decay 0.7 of the four fast axes, then the outcome of decision 6; `form = 0.95 form + 0.05 net / 10`).
  - `afterSignals(mood: Mood, signals: readonly Signal[]): Mood` (decision 6 values).
  - `interface Style { aggression: number; bluff: number; tightness: number }` (structurally equal to `BotStyle`); `NEUTRAL_STYLE`; `styleOf(mood: Mood): Style` with the formulas and clamps of decision 7.
  - `speakFactor(mood: Mood): number` in [0.75, 1.25] (decision 5).
  - `moodWords(mood: Mood): string[]`: short English descriptors for the prompt (`'on a winning streak'`, `'annoyed'`, `'cautious'`, ...), at most three, strongest first, empty when calm.
- [ ] **Step 1: Failing tests**: each signal moves its axis by the spec value; decay after three neutral hands; a bad beat of 15 bb adds tilt 0.3 and removes cheer 0.2; luck `null` adds no tilt; a fold preflop with net −0.5 bb changes nothing but form; fast-check: any sequence of signals and outcomes keeps every axis in [-1, 1], the style inside its clamps and `speakFactor` in range; `styleOf(CALM)` equals `NEUTRAL_STYLE` exactly.
- [ ] **Step 2–4: Run, implement, run.**
- [ ] **Step 5: Commit** `feat(talk): mood and style (issue #23)`.

### Task 5: Talk state machine

**Files:**
- Create: `web/src/talk/talk.ts`, `web/src/talk/handTracker.ts` (her cards, board, pot, actions, all-in board, outcome), `web/src/talk/summary.ts`
- Test: `web/src/talk/talk.test.ts`, `web/src/talk/handTracker.test.ts`

**Interfaces:**
- Consumes: Tasks 3 and 4.
- Produces:
  - `interface HandFacts { street: string; board: Card[]; pot: number; stacks: [number, number]; her: [Card, Card] | null; actions: string[]; bigBlind: number }` (actions as plain text like `"player raises to 60"`).
  - `interface LineIntent { situation: Situation; hint: StrengthClass | null; honest: boolean; strength: StrengthClass; street: string; handNumber: number }`.
  - `interface SessionSummary { hands: number; netBb: number; playerBluffsShown: number; playerAllIns: number; signals: Partial<Record<Signal, number>> }`.
  - `interface Talk { observe(events: readonly EngineEvent[], nowMs: number): LineIntent | null; hear(signals: readonly Signal[]): void; replyIntent(): LineIntent; facts(): HandFacts; mood(): Mood; style(): Style; summary(): SessionSummary; setLevel(level: Level): void }`.
  - `createTalk(options: { seat: SeatIndex; rng: Rng; level: Level; habits?: Habits }): Talk`.
- Behaviour: situations from events (her `acted` raise → `herBet`, her check or call → `herCall`, the player's raise → `playerBet`, `potAwarded` to her → `handWon`, else `handLost`, upgraded to `bluffCaught` per decision 6). `speak` is drawn with `habit.speak * speakFactor(mood)`, clamped to 1; `honest` drawn; hint is the strength or its opposite (decision 3) and `null` with probability `1 - hintRate` where the hint rate is 0.7 for bet situations and 0 for hand-end situations. Pace (decision 5): one unprompted line per street, none within 1500 ms of the previous. At `handEnded` it applies `afterHand` with luck from `equityVsHand` at the all-in board when the hand reached showdown with no action after the last betting street. `replyIntent` always returns an intent for the current spot, with `situation` of the last event.
- [ ] **Step 1: Failing tests**: a scripted hand of engine events (build them with `engine` functions in the test) yields `herBet` on her raise; with a seeded rng and `BASE_HABITS` on `obvious`, over 5,000 simulated `herBet` spots with a weak hand the speak rate is 0.6 ± 0.03 and honest 0.2 ± 0.03; on `hidden` the speak rates for weak and strong differ by under 0.05; the pace rule blocks a second line in one street and within 1500 ms; `bluffCaught` when she bet the river with a weak hand and lost the showdown; a preflop fold, a split pot and an all-in runout update mood as in Task 4, luck only in the runout; `summary()` counts hands, net and signals heard.
- [ ] **Step 2–4: Run, implement, run.**
- [ ] **Step 5: Commit** `feat(talk): intents, pace and outcomes (issue #23)`.

### Task 6: Arena, styled and talking bots and the reader

**Files:**
- Create: `web/tools/arena/reader.ts`, `web/tools/arena/talking.ts`
- Modify: `web/tools/arena/bots.ts`, `web/tools/arena/match.ts`, `web/tools/arena/README.md`
- Test: `web/tools/arena/reader.test.ts`, `web/tools/arena/talking.test.ts`, `match` tests

**Interfaces:**
- Consumes: `CfrBot.setStyle` (Task 2), `createTalk`/`habitsAt`/`strengthOf` (Tasks 3 to 5).
- Produces: `ArenaBot.spoke?(): boolean` (did it speak on its last decision) and `ArenaBot.heard?(spoke: boolean): void`; bots `cfr-tilted`, `cfr-confident`, `cfr-cautious`, `cfr-talk-obvious`, `cfr-talk-subtle`, `cfr-talk-hidden`, `reader` in `BOTS`.
- Match loop: after a decide that is a raise, if the actor has `spoke`, the other bot's `heard?.(actor.spoke())` runs before the next decision.
- Talking bots speak only on `herBet`, by `habitsAt(BASE_HABITS, level).herBet[strength].speak` with a neutral mood.
- Reader: decision 9.
- [ ] **Step 1: Failing tests**: the reader turns a math fold into a call after `heard(true)` when the call is at most half the pot and turns a math call into a fold after `heard(false)`; without `heard` it equals the math bot; a talking bot on `obvious` speaks after a weak-hand bet more often than after a strong one over 2,000 seeded spots; `match` calls `heard` only after raises.
- [ ] **Step 2–4: Run, implement, run.**
- [ ] **Step 5: Document the bots in the arena README. Commit** `feat(arena): styled and talking bots and the reader (issue #23)`.

### Task 7: Supabase project, schema, limits and CI

**Files:**
- Create: `supabase/config.toml` (from `supabase init`, with `[auth] enable_anonymous_sign_ins = true`), `supabase/migrations/20261030000000_talk.sql`, `supabase/tests/talk_test.sql` (pgTAP), `supabase/README.md`, `.github/workflows/talk-ci.yml`, `supabase/.gitignore`
- Modify: root `.gitignore` if needed

**Interfaces:**
- Produces: tables `talk_lines (id bigint identity, user_id uuid references auth.users, session_id text, speaker text check in ('mallorca','player'), text text check length ≤ 400, created_at timestamptz default now())`, `memories (id, user_id, fact text check length ≤ 200, created_at)`, `usage (user_id uuid, day date, calls int, primary key (user_id, day))`, `usage_total (day date primary key, calls int)`; RLS on all four: select own rows on `talk_lines` and `memories`, nothing else for `authenticated`; `consume_call(p_user uuid, user_limit int, global_limit int) returns boolean` security definer, executable by `service_role` only.
- [ ] **Step 1: Write pgTAP tests**: RLS enabled on all tables; a user sees only own lines and memories; `authenticated` cannot insert; `consume_call` returns true up to the limit and false after, per user and in total, and does not count a refused call.
- [ ] **Step 2: Write the migration.** Docker is not available locally, so the SQL is checked in CI.
- [ ] **Step 3: Write `talk-ci.yml`**: on pull requests touching `supabase/**`; job `function`: `denoland/setup-deno` (2.x), `deno fmt --check`, `deno lint`, `deno test` in `supabase/functions`; job `database`: `supabase/setup-cli`, `supabase db start`, `supabase test db`.
- [ ] **Step 4: Write `supabase/README.md`**: create the project, enable anonymous sign-ins, `supabase link`, `supabase db push`, `supabase secrets set ANTHROPIC_API_KEY=... TALK_DAILY_LIMIT=200 TALK_GLOBAL_DAILY_LIMIT=5000`, `supabase functions deploy talk`, and the repository variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- [ ] **Step 5: Commit** `feat(server): Supabase schema, limits and CI (issue #23)`. The database job is verified when the PR runs.

### Task 8: Edge Function, pure parts

**Files:**
- Create: `supabase/functions/talk/types.ts`, `filter.ts`, `prompt.ts`, `signals.ts`, `fixtures/line.json`, `fixtures/reply.json`, `fixtures/summary.json`, `supabase/functions/deno.json`
- Test: `filter.test.ts`, `prompt.test.ts`, `signals.test.ts`, `types.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `TalkRequest = LineRequest | ReplyRequest | SummaryRequest` with `kind`, `sessionId: string`, `locale: string`, `facts`, `intent`, `mood: string[]`, `recent: { speaker: 'mallorca' | 'player'; text: string }[]` (at most 8), `text` (reply, 1 to 200 characters), `summary` (the `SessionSummary` shape of Task 5); `parseRequest(body: unknown): TalkRequest | null`.
  - `filter.ts`: `leaksCards(text: string, hole: readonly string[]): boolean` and `FALLBACK_LINES: readonly string[]` (five short neutral lines in her voice, no dashes, no all-caps).
  - `prompt.ts`: `SYSTEM_PROMPT: string` (character and rules of decision 12) and `buildMessages(req: LineRequest | ReplyRequest, memories: readonly string[], strict: boolean): { system: SystemBlock[]; messages: Message[] }` where the system block carries `cache_control: { type: 'ephemeral' }` and `strict` adds the stricter no-cards instruction.
  - `signals.ts`: `SIGNAL_TOOL` (a tool with a JSON schema: `signals: Signal[]`) and `parseSignals(input: unknown): Signal[]` (unknown values dropped, duplicates removed).
- [ ] **Step 1: Failing tests**: `leaksCards` is true for `"I have Ks"`, `"K♠ here"`, `"king of spades"`, `"I've got a pair of kings"` when she holds a king, `"у меня два короля"`, and false for `"this one feels good"`, `"nice river"`, `"I like this flop"`; `parseRequest` accepts each fixture and rejects a missing kind, an empty or 201-character text and more than 8 recent lines; the prompt contains the hint instruction for an honest strong hint and the opposite for a dishonest one, the mood words, the memories and the locale; `parseSignals(['tease', 'x', 'tease'])` is `['tease']`.
- [ ] **Step 2–4: Run `deno test`, implement, run.**
- [ ] **Step 5: Commit** `feat(server): talk prompt, card filter and signals (issue #23)`.

### Task 9: Edge Function handler

**Files:**
- Create: `supabase/functions/talk/handler.ts`, `model.ts`, `index.ts`
- Test: `supabase/functions/talk/handler.test.ts`

**Interfaces:**
- Consumes: Task 8.
- Produces: `interface Deps { userId(req: Request): Promise<string | null>; consume(userId: string): Promise<boolean>; memories(userId: string): Promise<string[]>; saveLines(userId: string, sessionId: string, lines: { speaker: string; text: string }[]): Promise<void>; saveFacts(userId: string, facts: string[]): Promise<void>; complete(input: { system: SystemBlock[]; messages: Message[]; tool?: Tool }): Promise<{ text: string; toolInput: unknown }> }`; `handle(req: Request, deps: Deps): Promise<Response>`. `model.ts` builds `complete` over `npm:@anthropic-ai/sdk` with `TALK_MODEL ?? 'claude-haiku-5-5'`, `max_tokens` 120 for lines and 200 for summaries. `index.ts` builds `Deps` with `npm:@supabase/supabase-js` and the service role, and calls `Deno.serve`.
- Responses: 401 without a user, 400 for a bad body, 429 `{ silent: true }` over a limit, 200 `{ text }` for a line, `{ text, signals }` for a reply (two `complete` calls in parallel), `{ facts }` for a summary (at most three facts of at most 200 characters). A leaking text retries once with `strict`; a second leak answers a `FALLBACK_LINES` entry. CORS for the game's origins with an `OPTIONS` preflight. A model error answers 502.
- [ ] **Step 1: Failing tests with fake `Deps`**: each status above; a reply returns signals from the tool input; a leak then a clean text returns the clean text and calls `complete` twice; two leaks return a fallback line; the lines of a reply are saved for both speakers; a summary saves its facts.
- [ ] **Step 2–4: Run, implement, run.**
- [ ] **Step 5: Commit** `feat(server): talk function (issue #23)`.

### Task 10: Talk client in the game

**Files:**
- Create: `web/src/game/talkClient.ts`
- Modify: `web/package.json` (add `@supabase/supabase-js`), `web/src/game/index.ts`
- Test: `web/src/game/talkClient.test.ts`

**Interfaces:**
- Consumes: the fixtures of Task 8 as the contract.
- Produces: `interface TalkClient { readonly enabled: boolean; line(req: LinePayload): Promise<string | null>; reply(req: ReplyPayload): Promise<{ text: string; signals: Signal[] } | null>; summary(req: SummaryPayload): Promise<void> }`; `silentTalkClient: TalkClient` (`enabled` false, every call resolves `null`); `remoteTalkClient(options: { url: string; anonKey: string; fetch?: typeof fetch }): Promise<TalkClient>` that signs in anonymously and returns `silentTalkClient` when sign-in fails; every call times out after 5 s and turns errors and 429 into `null`. The payload types mirror `types.ts` of Task 8.
- [ ] **Step 1: Failing tests** with a fake `fetch`: the payloads built from a scripted spot deep-equal the shapes of the Task 8 fixtures (read with `fs` in the test); a 429 resolves `null`; a hanging request resolves `null` after 5 s (fake timers); a failed sign-in yields a disabled client.
- [ ] **Step 2–4: Run, implement, run.**
- [ ] **Step 5: Commit** `feat(game): talk client (issue #23)`.

### Task 11: Talk in the session

**Files:**
- Create: `web/src/game/sessionTalk.ts`
- Modify: `web/src/game/session.ts`, `web/src/game/viewModel.ts`, `web/src/game/index.ts`, `web/src/main.tsx`
- Test: `web/src/game/sessionTalk.test.ts`, `web/src/game/session.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 5, 10.
- Produces: `interface ChatLine { id: number; speaker: 'mallorca' | 'player'; text: string; handNumber: number }`; `SessionState.talk: { available: boolean; on: boolean; level: Level; lines: ChatLine[]; bubbles: [ChatLine | null, ChatLine | null] }`; `SessionActions.say(text: string): void`, `quick(id: QuickPhrase): void`, `setTalk(on: boolean): void`, `setTells(level: Level): void`; `type QuickPhrase = 'niceHand' | 'bluffing' | 'notThisTime'`; `SessionOptions.talk?: TalkClient`, `SessionOptions.now?: () => number`.
- Rules: talk is available only when the client is enabled and the opponent is `cfr`; engine events go to `Talk.observe` after the bot; a returned intent triggers `client.line` without awaiting; a line is appended only if its hand number and street still match; `say` trims, caps at 200 characters, ignores empty text, appends the player's line at once, calls `reply`, feeds the signals to `hear`, and appends her answer; `quick` maps to signals as decision 17 and still asks for her answer; the bot's `decide` gets `talk.style()` when talk exists (also when talk is off, since outcomes still move the mood); a `summary` goes out on `leave` and every 50 hands; `main.tsx` builds the client from `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- [ ] **Step 1: Failing tests with a fake client and fake timers**: `requests a line on her bet`, `drops a stale line`, `say sends a reply and applies signals`, `say ignores blank text and caps length`, `talk off sends nothing`, `style reaches decide`, `client errors keep the game going`, `summary on leave and every 50 hands`, `math opponent has no talk`.
- [ ] **Step 2–4: Run, implement, run.** Keep `session.ts` under 400 lines.
- [ ] **Step 5: Commit** `feat(game): table talk in the session (issue #23)`.

### Task 12: Chat UI

**Files:**
- Create: `web/src/ui/Bubble.tsx`, `web/src/ui/Chat.tsx`, `web/src/ui/ChatSheet.tsx`, `web/src/ui/SidePanel.tsx`, `web/e2e/talk.spec.ts`
- Modify: `web/src/ui/Table.tsx`, `web/src/ui/Seat.tsx`, `web/src/ui/Settings.tsx`, `web/src/ui/preferences.ts`, `web/src/ui/usePreferences.ts`, `web/src/ui/styles/layout.css`, `web/src/locales/en.json`, `web/playwright.config.ts` (build env with a fake Supabase URL and key)
- Test: component tests next to each component, `preferences.test.tsx`, e2e

**Interfaces:**
- Consumes: Task 11 state and actions.
- Produces: preferences `readTalk/writeTalk` (`mallorca.talk`, default on) and `readTells/writeTells` (`mallorca.tells`, default `subtle`).
- Copy (en.json, key `talk`): `tab: "Chat"`, `log: "Log"`, `placeholder: "Say something to Mallorca"`, `send: "Send"`, `open: "Chat with Mallorca"`, `close: "Close chat"`, `quick.niceHand: "Nice hand"`, `quick.bluffing: "You're bluffing"`, `quick.notThisTime: "Not this time"`, `settings.talk: "Table talk"`, `settings.tells: "Tells"`, `settings.levels.obvious: "Obvious"`, `subtle: "Subtle"`, `hidden: "Hidden"`, `undelivered: "Not delivered"`.
- Behaviour: decision 19. The bubble types its text at about 40 characters per second and fades after 7 s, with no animation under reduced motion. The chat is absent when `talk.available` is false.
- [ ] **Step 1: Failing component tests**: the bubble shows the text and hides after 7 s; the chat sends on Enter and clears; quick chips call `quick`; settings toggle talk and tells and persist them, including storage that throws; the side panel switches tabs and keeps the hand log; nothing renders when talk is not available.
- [ ] **Step 2–4: Run, implement, run.**
- [ ] **Step 5: e2e `talk.spec.ts`** with `page.route` on the Supabase auth and function URLs: a bubble appears after her bet; the chat tab on desktop sends a message and shows her answer; on a 360×740 phone the sheet opens from the button and the action bar stays visible when it closes; talk off sends no function request; a 500 from the function keeps the hand going. Run `npm run test:e2e`.
- [ ] **Step 6: `npm run contact`** and look at `web/e2e/contact/phone.png` and `desktop.png` once each; fix anything that covers the board, the pot or the controls.
- [ ] **Step 7: Commit** `feat(ui): chat with Mallorca (issue #23)`.

### Task 13: Measurements, deploy variables and docs

**Files:**
- Modify: `.github/workflows/web-deploy.yml`, `.github/workflows/web-vercel.yml` (pass `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `vars`), `ARCHITECTURE.md` (talk layer, server, data flow), `web/tools/arena/README.md` (results), `README.md` if it lists features
- [ ] **Step 1: Arena runs** (seed 1, `--pairs 5000` unless noted): `cfr-tilted`, `cfr-confident`, `cfr-cautious` each against `cfr`; `reader` against `cfr-talk-obvious`, `cfr-talk-subtle` and `cfr-talk-hidden`; `math` against `cfr-talk-obvious` as the reader's baseline. If `cfr-tilted` loses more than 5 bb/100 to `cfr`, narrow the clamps of decision 7 in `style.ts`, update the spec in the same commit and rerun.
- [ ] **Step 2: Record the table** in the arena README.
- [ ] **Step 3: Update ARCHITECTURE.md and the workflows.**
- [ ] **Step 4: Full check**: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run test:golden`, `npm run build`, `npm run test:e2e`, the Rust checks, the Deno checks.
- [ ] **Step 5: Commit** `docs: table talk results and deploy variables (issue #23)`.

### Task 14: Is tilt noticeable, and what does it cost when exploited

Asked by the owner on 2026-10-30 after the style-cost result (cfr-tilted vs cfr −0.2 ± 2.6 bb/100): a near-equilibrium opponent does not punish shifted frequencies, so that number says nothing about whether tilt is visible or exploitable.

**Files:**
- Create: `web/tools/arena/stats.ts` (+ test), `web/tools/arena/exploiter.ts` (+ test)
- Modify: `web/tools/arena/bots.ts`, `web/tools/arena/run.ts` and/or `cli.ts` (a `--stats` flag or a separate script `npm run arena:stats`), `web/tools/arena/README.md`, possibly `web/src/talk/style.ts` and the spec decision 7 (only if the clamps change, in its own commit)

**Interfaces:**
- Produces: `styleStats(hands: EngineEvent[][], seat selector) -> { hands, vpip, pfr, aggressionFactor, betFrequency (bets+raises / decisions postflop), foldToBet, raiseFrequency }` for bot A; bot `tilt-exploiter`.

- Run every arena match with `taskpolicy -b` (owner: quiet, efficiency cores).
- [ ] **Step 1: Behaviour shift.** Compute the stats for bot A over saved hands (`--save-hands` jsonl or in-memory) for `cfr` vs `cfr`, `cfr-tilted` vs `cfr`, `cfr-confident` vs `cfr`, `cfr-cautious` vs `cfr`, 20,000 pairs each. Unit-test the stats on scripted hands first.
- [ ] **Step 2: Exploiter.** `tilt-exploiter`: the math bot, but facing a bet or raise it calls (instead of folding) when the call is at most half the pot, and it never bluff-raises into her (turns a math raise with a weak strength class into a call). It does not know whether the opponent is tilted: the cost of tilt is `tilt-exploiter vs cfr-tilted` minus `tilt-exploiter vs cfr` (same seed, 20,000 pairs each). Unit tests for its decision rule.
- [ ] **Step 3: Decide.** Noticeable means: raiseFrequency or betFrequency of cfr-tilted differs from cfr by at least 5 percentage points, and the exploiter gains on cfr-tilted more than on cfr by more than the combined 95% interval. If not noticeable, widen the clamps of decision 7 (aggression up to 1.6, bluff up to 1.8, keep tightness), update `cfr-tilted` to the new corner, update the spec in the same commit, rerun steps 1 and 2. Stop widening when the exploited cost of the corner exceeds 25 bb/100.
- [ ] **Step 4: Record** the tables in the arena README, commit `feat(arena): tilt stats and exploiter (issue #23)` (and `feat(talk): wider style clamps (issue #23)` if changed).
