# Table Readability (Part 3: sound effects) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Short synthesized sound effects for the deal, checks, chips, folds, the human's turn, a won pot and an all-in, with a sound toggle.

**Architecture:** All in `ui/sound/`: a pure mapping from new log entries and phase changes to cue names, a `SoundPlayer` interface with a Web Audio implementation that synthesizes each cue, and a hook that watches the session store and plays cues. `game` does not know about sound. A stored preference and two toggles (status bar, menu) switch it.

**Tech Stack:** TypeScript strict, Preact, Web Audio API, Vitest, @testing-library/preact, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-table-readability-design.md` (Part 3).

## Global Constraints

- Work from `web/`: `source ~/.nvm/nvm.sh && nvm use` before npm.
- Before each commit: `npm run lint`, `npx tsc --noEmit`, `npm test`. Before the PR also `npm run test:golden`, `npm run build`, `npm run test:e2e`.
- TDD: the failing test first. Never weaken a test, delete an assertion, add `eslint-disable` or a suppression.
- No comments in code or config. No audio files: every sound is synthesized.
- ESLint limits on non-test `src` files: 400 lines per file, 60 per function, nesting 3, complexity 12, 4 parameters, no import cycles.
- `ui` imports only from `game`.
- Every UI string comes from `src/locales/en.json`. No all-caps words, no em or en dashes as punctuation.
- Every colour and size is a token in `ui/styles/tokens.css`.
- Commits: conventional with the layer as scope, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Run `git branch --show-current` first; the branch is `feat/sound-effects`. Never push.
- After a UI change: `npm run contact`, then look at `e2e/contact/phone.png` and `e2e/contact/desktop.png` once each.

## Review Focus

- The browser blocks audio until a user gesture: no `AudioContext` is created before the first click on a start button, and nothing throws when Web Audio is missing (jsdom, old browsers). Task 2 pins both.
- A burst of events in one store update (blinds plus deal; a call that closes the street plus the next card; an all-in runout) plays a few distinct cues, not a pile of overlapping ones. Task 1 pins the dedupe.
- Sound off means silence for every cue, including the turn chime, and the choice survives a reload. Task 3 pins it.
- A reload mid-hand or a new game does not replay the whole old log. Task 4 pins it.
- Tests stay silent and fast: component tests use a recording fake player.

---

### Task 1: Cues from log entries and phases

**Files:**
- Create: `web/src/ui/sound/cues.ts`
- Test: `web/src/ui/sound/cues.test.ts`

**Interfaces:**
- Produces: `type Cue = 'deal' | 'check' | 'chips' | 'fold' | 'turn' | 'win' | 'allIn'`.
- Produces: `cuesFor(entries: LogEntry[]): Cue[]`: map each entry, then keep the first occurrence of each cue in order. Mapping: `handStarted`, `flop`, `turn`, `river` → `deal`; `post`, `call`, `raise`, `bet` → `chips`; `check` → `check`; `fold` → `fold`; `allIn` → `allIn`; `win` → `win`; everything else → nothing. When `allIn` is present, `chips` is dropped.
- Produces: `turnCue(previous: Phase, next: Phase): Cue | null`: `'turn'` when `next === 'humanToAct'` and `previous !== 'humanToAct'`, else null.

- [ ] **Step 1: Write failing tests**: `handStarted, post, post` → `['deal','chips']`; `call, flop` → `['chips','deal']`; `raise, allIn` → `['allIn']`; `fold, returned, win` → `['fold','win']`; `show` → `[]`; `turnCue('botThinking','humanToAct')` → `'turn'`; `turnCue('humanToAct','humanToAct')` → null.
- [ ] **Step 2: Run** and see them fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** lint, tsc, `npm test`.
- [ ] **Step 5: Commit** `feat(ui): sound cues from the hand log`.

### Task 2: The synthesized player

**Files:**
- Create: `web/src/ui/sound/player.ts`
- Test: `web/src/ui/sound/player.test.ts`

**Interfaces:**
- Consumes: `Cue` from Task 1.
- Produces: `interface SoundPlayer { unlock(): void; play(cue: Cue, delayMs?: number): void }`.
- Produces: `silentPlayer: SoundPlayer` (does nothing).
- Produces: `createSynthPlayer(makeContext: () => AudioContext | null = defaultContext): SoundPlayer`. `defaultContext` returns `new AudioContext()` when `globalThis.AudioContext` exists, else null. `unlock()` creates the context once (and calls `resume()` if suspended); `play` before `unlock` or with a null context does nothing. Each cue is a short envelope (all under 400 ms) through one master gain of 0.25: `deal` a 60 ms filtered noise burst; `check` two 30 ms low knocks (a 120 Hz sine with fast decay) 90 ms apart; `chips` three 25 ms high clicks (band-passed noise around 3 kHz) 40 ms apart; `fold` a 150 ms soft noise sweep downward; `turn` a two-note sine chime (660 Hz then 880 Hz, 120 ms each); `win` four chip clicks then a 880 Hz note; `allIn` a heavier chip burst (six clicks, lower band 1.8 kHz). `delayMs` offsets the start.

- [ ] **Step 1: Write failing tests** with a fake `AudioContext` that records created oscillators, buffer sources and their `start` times: no context is made before `unlock`; `unlock` twice makes one context; every cue starts at least one source and schedules all `start` and `stop` times within `currentTime + delay + 0.4 s`; `play('turn', 200)` starts at `currentTime + 0.2`; a factory returning null makes `unlock` and `play` no-ops.
- [ ] **Step 2: Run** and see them fail.
- [ ] **Step 3: Implement** (keep each function under the 60-line limit: one small builder per cue).
- [ ] **Step 4: Run** lint, tsc, `npm test`.
- [ ] **Step 5: Commit** `feat(ui): synthesized sound player`.

### Task 3: Sound preference and toggles

**Files:**
- Modify: `web/src/ui/preferences.ts`, `web/src/ui/usePreferences.ts`, `web/src/ui/Settings.tsx`, `web/src/ui/StatusBar.tsx`, `web/src/ui/App.tsx`, `web/src/locales/en.json`, `web/src/ui/styles/layout.css`
- Test: `web/src/ui/preferences.test.tsx`, `web/src/ui/App.test.tsx`

**Interfaces:**
- Produces: `readSound(): boolean` (default true; false only when `localStorage['mallorca.sound'] === 'off'`; true when storage throws) and `writeSound(on: boolean)` in `preferences.ts`.
- Produces: `Preferences.sound: boolean` and `Preferences.toggleSound: () => void`.
- Produces: a status bar button before the log toggle, `data-testid="sound-toggle"`, `aria-pressed={sound}`, `aria-label={t('status.sound')}`, an inline stroke speaker icon (with waves when on, a cross when off), 44 px; and a menu checkbox `data-testid="sound"` labelled `t('status.sound')`. Copy: `status.sound` = `"Sound"`.

- [ ] **Step 1: Write failing tests**: `readSound` default true, `'off'` → false, throwing storage → true; `App.test`: clicking `sound-toggle` flips `aria-pressed` and the menu checkbox, and the value persists through `readSound`.
- [ ] **Step 2: Run** and see them fail.
- [ ] **Step 3: Implement**; the status bar must still fit at 360 px (run `npx playwright test e2e/layout.spec.ts e2e/table.spec.ts`).
- [ ] **Step 4: Run** lint, tsc, `npm test`; `npm run contact`, look at both sheets.
- [ ] **Step 5: Commit** `feat(ui): sound preference and toggles`.

### Task 4: Play cues from the session

**Files:**
- Create: `web/src/ui/sound/useSoundCues.ts`
- Modify: `web/src/ui/App.tsx` (new optional prop `player?: SoundPlayer`, default `silentPlayer`), `web/src/main.tsx` (one `createSynthPlayer()` for the page, passed to every `App`), `web/src/ui/StartScreen.tsx` or `App.tsx` (call `player.unlock()` on the start click), `ARCHITECTURE.md`
- Test: `web/src/ui/sound/useSoundCues.test.tsx`, `web/src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `cuesFor`, `turnCue`, `SoundPlayer`, `Preferences.sound`.
- Produces: `useSoundCues(session: Session, player: SoundPlayer, enabled: boolean): void`: subscribes to the store; remembers the log length and phase it last saw (starting from the state at mount, so nothing old is replayed); on each update, when enabled, plays `cuesFor(newEntries)` with delays 0, 120, 240 ms… and then `turnCue(previous, next)` after them; when the log gets shorter (a new session), it resets its counter without playing.

- [ ] **Step 1: Write failing tests** with a recording fake player and a real session driven by the test bot used in other UI tests: starting a hand plays `deal` then `chips`; the human's turn plays `turn`; disabled plays nothing; mounting on a session that already has a log plays nothing; `App` calls `unlock` when a start button is clicked.
- [ ] **Step 2: Run** and see them fail.
- [ ] **Step 3: Implement** and wire; update `ARCHITECTURE.md` (the `ui/sound/` module, the `sound` preference key, test ids `sound-toggle` and `sound`).
- [ ] **Step 4: Run** the full pre-PR list: lint, tsc, `npm test`, `npm run test:golden`, `npm run build`, `npm run test:e2e`.
- [ ] **Step 5: Commit** `feat(ui): play sound cues during the game` and `docs: sound effects`.
