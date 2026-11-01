# Persona core, stage 1, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the live opponent (her perception of the hand and her emotions) into a `persona` layer that speech, face,
voice and play only read; rename `talk` to `conversation` and the play `style` to `bias`; change no behaviour.

**Architecture:** `emotion` stays the model. A new pure layer `persona` owns the hand tracker, her equity, the engine,
the journal (now an impulse stream with ids), her stance and her bias. `conversation` (today's `talk` without her
feeling) consumes the `Moment`s a persona's `observe` returns and reads a `PersonaReader`. `game` creates the persona
on every `start`, routes chat signals to it and hands readers to speech, face and debug.

**Tech Stack:** TypeScript strict, Preact, zustand, Vitest, ESLint layer rules; Rust (`solver/crates/core`,
`solver/crates/wasm`) for the bias rename of the bot.

**Spec:** `docs/superpowers/specs/2026-11-01-persona-core-design.md`

## Global Constraints

- No behaviour change: seeded sessions play, speak, record and send the same bytes; no test assertion is weakened,
  deleted or loosened.
- No comments in code or config. ESLint limits per non-test file: 400 lines, 60 per function, depth 3, complexity 12,
  4 parameters, no import cycles.
- Layers: `persona` imports `cards`, `equity`, `emotion`, types from `engine`; `conversation` imports `cards`,
  `emotion`, types from `engine`, types from `persona` (its tests may import `persona` and `engine` values); `game`
  adds `persona` and `conversation` in place of `talk`.
- Kept names: Edge Function `talk`, tables `talk_lines`, `memories`, `usage`, `supabase/functions/talk/eval`,
  `talk-ci.yml`, preference key `mallorca.talk`, the `style` key of stored hand-record decisions.
- Commit before every commit: `npm run lint`, `npx tsc --noEmit`, `npm test` (from `web/`, after
  `source ~/.nvm/nvm.sh && nvm use`); Rust tasks also `cargo fmt --all`, `cargo clippy --all-targets -- -D warnings`,
  `cargo test` and both wasm builds from `solver/`. `git branch --show-current` is `persona-core`.
- Conventional commits with the layer as scope, ending with the `Co-Authored-By` line.

## Review Focus

1. A face switched off and on mid-hand: no stale pulse (pinned in Task 5).
2. A late player-range answer after a new hand or a new `start`: dropped (existing `sessionRange.test.ts`, kept).
3. A reply arriving after talk was switched off: no signal reaches her (pinned in Task 5).
4. Debug personality chosen before `start` applies to the next persona (existing debug tests, kept).
5. An old hand record with `decisions[].style` still reads and exports (pinned in Task 2).

---

### Task 1: `style` to `bias` in the bot and its ABI

**Files:**
- Modify: `solver/crates/core/src/bot/style.rs` → `bias.rs`, `bot/mod.rs`, `bot/range.rs`, `bot/decision.rs`,
  `bot/tests.rs`; `solver/crates/wasm/src/lib.rs`, `src/tests.rs`
- Modify: `web/src/cfr/model.ts`, `web/src/cfr/brain.ts`, `web/src/cfr/abi.test.ts`, `web/src/cfr/cfr.test.ts`,
  `web/src/brains/brain.ts`, `web/src/brains/index.ts`

**Interfaces:**
- Produces: Rust `bot::bias::{Bias, biased}`, `Bias::NEUTRAL`, `Bot::set_bias`, `Decision.biased`; wasm export
  `bot_bias`; TS `BotBias { aggression, bluff, tightness, sizing, stickiness }`, `Brain.setBias?(bias: BotBias)`,
  `Breakdown.biased: number[]`, `CfrBot.setBias`.

- [ ] **Step 1:** In `abi.test.ts` and `cfr.test.ts` rename the expectations (`bot_bias`, `setBias`, `biased`). Run
  `npx vitest run src/cfr` and see them fail on the missing export and methods.
- [ ] **Step 2:** Rename in Rust (`git mv style.rs bias.rs`, type, functions, fields, tests, `bot_style` export).
  Run the Rust checks of the Global Constraints; all pass.
- [ ] **Step 3:** Rename in `cfr` and `brains`. Run `npm test`; the wasm is rebuilt and all pass.
- [ ] **Step 4:** Commit `refactor(solver): the bot's style is its bias`.

### Task 2: `style` to `bias` in emotion, talk, game and ui, with the baseline seam

**Files:**
- Modify: `web/src/emotion/style.ts` → `bias.ts`, `engine.ts`, `personality.ts`, `index.ts`, `emotion.test.ts`
- Modify: `web/src/talk/style.ts` → `bias.ts`, `feeling.ts`, `talk.ts`, `index.ts`, tests
- Modify: `web/src/game/` (`botClient.ts`, `workerProtocol.ts`, `workerHandler.ts`, `session.ts`, `sessionTalk.ts`,
  `debug.ts`, `debugView.ts`, `records/record.ts`, `records/recorder.ts`, `index.ts`, tests), the debug panel in
  `web/src/ui`, `web/prototypes/emotion-lab`, `web/tools/arena`
- Modify: `ARCHITECTURE.md`, `docs/emotion/README.md` ("Стиль игры" to "Перекос игры")

**Interfaces:**
- Produces: `PlayBias`, `BIAS_KEYS`, `BiasKey`, `BIAS_RANGE`, `biasOf(drivers, leakage, baseline): PlayBias`,
  `Traits.baseline: PlayBias` (all ones), `Snapshot.bias`; `Bias`, `NEUTRAL_BIAS` (bot-facing, `tightness`);
  `BotClient.decide(legal, bias?, explain?)`; `DebugState.sentBias`, `DebugView.engineBias`, `DebugView.sentBias`,
  `DecisionRow.biased`. `cfrStyleOf` is removed.

- [ ] **Step 1: Failing tests** in `emotion.test.ts`:
  - `biasOf multiplies the baseline`: with zero drivers and `baseline.aggression = 1.2`, `biasOf(...).aggression` is
    `1.2`; with `baseline.aggression = 1.8` and an anger driver that gives `1.5` alone, the result is clamped to `2`.
  - `the default baseline is neutral`: every key of `traitsOf(MALLORCA).baseline` is `1`.
  In `records` tests: `a stored decision keeps the style key`: `recordDecision(decision, 3, bias).style` deep-equals
  `bias`.
- [ ] **Step 2:** Run `npx vitest run src/emotion src/game/records`; they fail.
- [ ] **Step 3:** Rename and add the seam; the stored record field stays `style` (typed `BotBias`).
- [ ] **Step 4:** `npm run lint && npx tsc --noEmit && npm test`; all pass.
- [ ] **Step 5:** Commit `refactor(emotion): the play style is a bias over a baseline`.

### Task 3: `talk` to `conversation`

**Files:**
- Move: `web/src/talk/` → `web/src/conversation/`; `game/sessionTalk.ts` → `sessionConversation.ts`,
  `talkClient.ts` → `conversationClient.ts`, `remoteTalk.ts` → `remoteConversation.ts`, `talkLoader.ts` →
  `conversationLoader.ts` and their tests; `ui` components whose names say Talk
- Modify: every importer in `src`, `tools/arena`, `prototypes`, `e2e`, `src/main.tsx`, `eslint.config.js`,
  `src/locales/en.json` (keys under `talk` → `conversation`), `ARCHITECTURE.md`

**Interfaces:**
- Produces: `Conversation`, `ConversationOptions`, `createConversation`; `SessionConversation`,
  `ConversationState`, `initialConversation`; `SessionState.conversation`; actions `setConversation`,
  `attachConversation`; options `conversation`, `connectConversation`, `conversationOn`; `ConversationClient`,
  `ConversationReply`, `silentConversationClient`, `loadConversationClient`, `conversationConnector`,
  `ConversationConfig`; `ViewModel.conversation` (`ConversationView`).

- [ ] **Step 1:** `git mv` the files, then rename identifiers with a scripted pass over `web/` (word-boundary
  replacements of the names above), leaving the kept names of the Global Constraints. `mallorca.talk` stays in
  `ui/preferences.ts`; the URL of the Edge Function stays `talk` in `remoteConversation.ts`.
- [ ] **Step 2:** `npm run lint && npx tsc --noEmit && npm test`; all pass with no assertion changed
  (`git diff --stat` shows only renames and identifier changes in tests).
- [ ] **Step 3:** `grep -rn "talk" web/src web/tools web/prototypes web/e2e` lists only the kept names.
- [ ] **Step 4:** Commit `refactor(conversation): talk is conversation`.

### Task 4: the `persona` layer

**Files:**
- Create: `web/src/persona/index.ts`, `persona.ts` (`createPersona`), `view.ts` (bias, words, speak factor of a
  snapshot)
- Move from `conversation/`: `handTracker.ts` → `persona/hand.ts`, `feeling.ts` → `persona/perception.ts`,
  `range.ts`, `strength.ts`, `journal.ts`, `signals.ts`, `bias.ts`, with their tests
- Modify: `conversation/talk.ts` (now `conversation.ts`) uses a `Persona` it creates, through `Moment`s;
  `eslint.config.js` (layer `persona`; `conversation` may still import `persona` values until Task 5)
- Test: `web/src/persona/persona.test.ts`

**Interfaces:**
- Produces, exactly as the spec's "Persona" section: `createPersona({ seat, rng, personality? }): Persona`,
  `Persona`, `PersonaReader`, `PersonaView { personality, snapshot, hand, stance, bias, words, speakFactor }`,
  `Moment { event, before, after, strength, playerBluffShown }`, `JournalEntry { id, handNumber, event, impulses,
  words }`, `journal()`, `journalSince(id)`, `lastJournalId()`, `strength()`, `observe`, `narrow`, `hear`,
  `setPersonality`, `reset`; `Stance`, `StrengthClass`, `strengthOf`, `HandState`, `Signal`, `SIGNALS`, `Bias`,
  `NEUTRAL_BIAS`, `wordsOf`, `JOURNAL_SIZE`; re-exports of `emotion` that `game` needs (`EMOTIONS`, `LOAD_SOURCES`,
  `PERSONALITIES`, `BIAS_KEYS`, `MALLORCA` and their types).
- `observe` computes `strength` on a moment when the event is her check, call or raise, a raise of the player, or
  `handEnded` (the points where today's `Talk.step` calls `strength()`), and `playerBluffShown` on `handEnded`, after
  `strength`, both from the persona's generator, so the draw order is today's.

- [ ] **Step 1: Failing tests** in `persona.test.ts`, on a scripted hand built with the engine (as
  `conversation` tests do):
  - `view does not move her`: `view(t + 5000)` twice gives equal snapshots, and a later `observe(events, t + 6000)`
    gives the same snapshot as on a persona never viewed.
  - `two cursors see the same impulses`: after a hand, `journalSince(0)` read twice returns the same ids, oldest
    first; `journal()` is newest first; ids increase by 1.
  - `the journal keeps the newest 50`.
  - `moments follow the events`: one moment per event; `before.street` and `after.street` around a `streetDealt`;
    `strength` non-null on her call and on `handEnded`, null on `blindPosted`.
  - `narrow ignores another hand and a shown hand`: the snapshot is unchanged.
  - `hear appraises chat`: a `tease` adds a journal entry with a `chat` event.
  - `a seeded persona equals the old feeling`: the snapshot after a scripted hand equals the one the moved
    `perception.test.ts` expects.
- [ ] **Step 2:** Run `npx vitest run src/persona`; they fail.
- [ ] **Step 3:** Implement `createPersona` in `persona.ts` over the moved `perception.ts` (the `TableFeeling` of
  today, minus words and speak factor, which move to `view.ts`), the tracker and the strength cache, stance and
  `bluffKey` moved from `TableTalk`.
- [ ] **Step 4:** Make `TableTalk` create a persona from its `rng` (its first draw seeds the persona's generator, as
  `luck` today) and consume `persona.observe`'s moments in place of its own tracker; its public API is unchanged.
- [ ] **Step 5:** `npm run lint && npx tsc --noEmit && npm test`; the new tests and every existing one pass.
- [ ] **Step 6:** Commit `feat(persona): her perception and feeling in a layer of her own`.

### Task 5: `game` owns the persona; speech, face and debug read it

**Files:**
- Create: `web/src/game/sessionPersona.ts` and `sessionPersona.test.ts`
- Modify: `conversation/conversation.ts` (no persona inside: `observe(moments, view, nowMs)`,
  `replyIntent(persona: PersonaReader)`, `facts(view)`, `feelingFor(intent, view)`, `moodWords(view)`,
  `character(view)`, `heard(signals)`, `summary()`, `setLevel`), `conversation/index.ts`
- Modify: `game/session.ts`, `sessionConversation.ts`, `sessionFace.ts`, `sessionWiring.ts`, `debug.ts`,
  `debugView.ts`, `sessionTypes.ts`, `index.ts` and their tests; `eslint.config.js` (`conversation` takes only types
  from `persona`); `tools/arena` users of the conversation API
- Modify: `ARCHITECTURE.md` (layers, `persona` section, `conversation`, the `game` talk, face and debug paragraphs,
  data flow), `docs/emotion/README.md` (status line, "Связь с разговорным агентом")

**Interfaces:**
- `SessionPersona { begin(rng: Rng): void; observe(events): Moment[]; hear(signals): void; current(): Persona | null;
  setPersonality(p): void; reset(): void; askRange(events, epoch, handNumber): void }`: `begin` creates
  `createPersona({ seat: botSeat, rng, personality })`, `askRange` is today's `Wiring.askRange` (Solver opponent only).
- `restart` makes `speech = mulberry32(seed ^ 0x7a1c)`, then `persona.begin(mulberry32(floor(speech.next() * 2³²)))`,
  then `conversation.begin(opponent, speech)`.
- `record` runs `bot.observe`, `persona.observe`, `conversation.observe(moments)`, `face.observe(events)`, then the
  range request.
- `sessionFace` holds a cursor; `observe` reads `journalSince(cursor)`; `setOn` moves the cursor to
  `lastJournalId()`.
- `DebugProbe` reads `persona.current()`; it keeps the ids of entries made by an observe whose conversation returned
  an intent and returns `journal` entries with `spoke`.

- [ ] **Step 1: Failing tests:**
  - `sessionPersona.test.ts`: `the bias sent with decide is the persona's view at that moment` (a fake clock, a
    Solver bot double, `decide`'s `bias` deep-equals `persona.view(now).bias`); `the math bot gets no bias`.
  - `sessionFace.test.ts`: `a face switched off and on mid-hand shows no old pulse`.
  - `sessionConversation.test.ts`: `a reply's signals reach her through the session` (journal gains a `chat`
    entry); `a reply after talk is switched off moves nothing`.
  - `sessionConversation.test.ts`: `a seeded session sends the same bodies`: the `line`, `reply` and `summary`
    payloads of a seeded session equal a fixture recorded from `master` before this task (record it first with the
    old code, commit it with the test).
- [ ] **Step 2:** Run them; the new API ones fail.
- [ ] **Step 3:** Implement the split; update the conversation tests to build a persona and pass its moments and view
  (through one test helper), assertions unchanged.
- [ ] **Step 4:** `npm run lint && npx tsc --noEmit && npm test`; all pass. Add a value import from `persona` to a
  `conversation` file, see `npm run lint` fail, revert it.
- [ ] **Step 5:** Commit `refactor(game): the session owns her persona, speech and face read it`.

### Task 6: verification and pull request

- [ ] **Step 1:** `npm run test:golden`, `npm run build`, `E2E_PORT=4810 npm run test:e2e`; all pass.
- [ ] **Step 2:** `CONTACT_PORT=4811 npm run contact`; look at `e2e/contact/phone.png` and `desktop.png` once each:
  nothing differs from the table before.
- [ ] **Step 3:** `taskpolicy -b npm run arena -- --a cfr --b always-call --pairs 200`; it runs and prints bb/100.
- [ ] **Step 4:** Push `persona-core` and open the pull request with the repository template.
