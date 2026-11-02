# Persona presenting, stage 2, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One strength class (her perceived equity) and one decision of what she presents, read by the face, the
words, the prompt and the voice; the tells setting goes.

**Architecture:** `persona` derives her class from the equity the engine already follows and decides `Presenting`
and her `mask`; `face` takes the presenting effort and stance from the view; `conversation` draws hints and the
speak chance from the view's presenting and mask; `game` and `ui` drop `tells`.

**Tech Stack:** TypeScript strict, Preact, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-01-persona-presenting-design.md`

## Global Constraints

- Branch `persona-presenting`, stacked on `persona-core` (PR #77 is open).
- Checks before every commit: `npm run lint`, `npx tsc --noEmit`, `npm test` from `web/`.
- No comments; ESLint size limits; layer rules of `ARCHITECTURE.md`; never weaken a test. A test of removed
  behaviour (the honesty table, the tells levels) is replaced by a test of the new rule in the same commit.
- `web/src/game/fixtures/sessionPayloads.json` is recorded again in each task that changes lines on purpose, with
  the reason in the commit.
- Kept: arena bot names `cfr-talk-obvious`, `cfr-talk-subtle`, `cfr-talk-hidden`; server contract version 1.

## Review Focus

1. A raise that narrows him mid-street turns `hide` off at once (face and words follow the same view).
2. Overload lowers the mask, so a tilted Mallorca leaks the truth in words as on her face.
3. A hand that ends at showdown: `bluffCaught` still needs her weak class before the cards were shown.
4. A player with a stored `mallorca.tells` preference: the app starts and ignores it.
5. Replies: the hint rule is the same for `replyIntent`.

---

### Task 1: her class from her perceived equity, presenting and mask

**Files:** `web/src/persona/perception.ts`, `persona.ts`, `view.ts`, `index.ts`, `persona.test.ts`,
`perception.test.ts`; fixture re-record.

**Interfaces:** `Feeling.perceived(hand): number` (equity against the range, his cards ignored, cached as today);
`classOf(equity, boardLength): StrengthClass` in `strength.ts`; `Presenting { stance: Stance; shows:
StrengthClass; effort: number }`; `PersonaView.presenting: Presenting | null`, `PersonaView.mask: number`;
`PRESENTING_EFFORT = { bluff: 0.6, hide: 0.5 }`.

- [ ] Failing tests in `persona.test.ts`: class follows a narrowed range (strong before, weak after
  `SETS_AND_TWO_PAIR` on her `Kh Qd`); `hide` off after that narrowing; `presenting` of a weak bet is
  `{ stance: 'bluff', shows: 'strong', effort: 0.6 }`; `mask` equals `maskOf(traits.mask, effort, overload)`;
  `handEnded` class of a lost showdown with a weak river bet is `weak`.
- [ ] Implement; re-record the fixture; all checks; commit `feat(persona): her class from her perceived equity
  and one decision of what she presents`.

### Task 2: the face reads her presenting

**Files:** `web/src/face/stance.ts`, `frame.ts`, `index.ts`, `face.test.ts`; `web/src/game/sessionFace.ts`;
`web/prototypes/emotion-lab` callers of `faceFrame`.

**Interfaces:** `faceFrame(s: Snapshot, presenting: Shown | null, look: FaceLook)` with
`Shown { stance: Stance; effort: number }`; `STANCES` holds `acted` only.

- [ ] Failing tests: the frame's mask equals `maskOf(traits.mask, presenting.effort, overload)`; `bluff` shown
  point moves toward `(0.2, 0, 0.6)`; `hide` toward neutral.
- [ ] Implement; checks; commit `refactor(face): her face acts what her persona presents`.

### Task 3: her words follow her presenting and her mask

**Files:** `web/src/conversation/habits.ts`, `conversation.ts`, `state.ts`, `index.ts` and tests,
`testSpeaker.ts`; `web/src/game/sessionConversation.ts`; `web/tools/arena/talking.ts`, `bots.ts`, tests;
`web/prototypes/emotion-lab/talkCases.ts`; fixture re-record.

**Interfaces:** `Habit { speak: number }`; `habitsAt(habits, readability: number)`; `drawHint(mask, presenting,
strength, rng, situation)`; `feelingState(s, acting, mask)`; `ConversationOptions` without `level`;
`createTalkingBot(inner, readability, rng)`.

- [ ] Failing tests: hint rules at mask 1 and 0 (spec "Words"); speak chance alike for every class at mask 1;
  `feelingFor` sends the view's mask; arena talking bots keep their names with readability 0, 0.5, 0.9.
- [ ] Implement; re-record the fixture; checks; commit `feat(conversation): her words lie only while she acts and
  leak by her mask`.

### Task 4: the tells setting goes

**Files:** `web/src/ui/Settings.tsx`, `App.tsx`, `preferences.ts`, `usePreferences.ts`, tests, `src/main.tsx`,
`src/locales/en.json`; `web/src/game/session.ts`, `sessionTypes.ts`, `sessionConversation.ts`, `viewModel.ts`,
tests; `web/e2e`.

- [ ] Failing test: the settings show no tells select; a stored `mallorca.tells` is ignored.
- [ ] Implement; checks; commit `feat(ui): no tells setting, her readability is her mask`.

### Task 5: documentation, verification, pull request

- [ ] `ARCHITECTURE.md`, `docs/emotion/README.md`, `tools/arena/README.md`.
- [ ] `test:golden`, `build`, `E2E_PORT=4810 npm run test:e2e`, `CONTACT_PORT=4811 npm run contact` (look at both
  sheets), arena runs of the three talking bots; whole-branch review; PR against `persona-core`.
