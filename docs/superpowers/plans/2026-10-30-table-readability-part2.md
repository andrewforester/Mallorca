# Table Readability (Part 2: the hand log) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the hand log off the table into a drawer opened by an icon, showing the current hand grouped by street.

**Architecture:** A pure grouping function in `ui` turns the session's `LogEntry` list into street groups for the current hand; a `HandLogDrawer` component renders them; `StatusBar` gets a toggle; the side column on desktop and the log in the menu go away.

**Tech Stack:** TypeScript strict, Preact, i18next, Vitest, @testing-library/preact, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-table-readability-design.md` (Part 2). Prototype:
https://claude.ai/artifact/VEEB6BPvVtg29hK4gUYydn (the log icon in the status bar).

## Global Constraints

- Work from `web/`: `source ~/.nvm/nvm.sh && nvm use` before npm.
- Before each commit: `npm run lint`, `npx tsc --noEmit`, `npm test`. Before the PR also `npm run test:golden`, `npm run build`, `npm run test:e2e`.
- TDD: the failing test first. Never weaken a test, delete an assertion, add `eslint-disable` or a suppression.
- No comments in code or config.
- ESLint limits on non-test `src` files: 400 lines per file, 60 per function, nesting 3, complexity 12, 4 parameters, no import cycles.
- `ui` imports only from `game`.
- Every UI string comes from `src/locales/en.json`. No all-caps words, no em or en dashes as punctuation.
- Every colour, size and shadow is a token in `ui/styles/tokens.css`.
- Commits: conventional with the layer as scope, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Run `git branch --show-current` first; the branch is `feat/hand-log-drawer`. Never push.
- After a UI change: `npm run contact`, then look at `e2e/contact/phone.png` and `e2e/contact/desktop.png` once each.

## Review Focus

- A session of many hands: the drawer shows only the current hand (entries after the last `handStarted`). Task 1 pins it.
- Between hands (hand over): the drawer still shows the finished hand, with the result as the last line. Task 1 pins it.
- A hand that ends preflop by a fold: one Preflop group only, no empty street groups. Task 1 pins it.
- Keyboard: Escape closes the drawer and focus returns to the toggle; the game keys (`f`, `c`, `r`) keep working while it is closed. Task 2 pins Escape.
- Small phone 360 × 740: the open drawer fits without horizontal scroll and leaves the close button reachable. Task 4 pins it.

---

### Task 1: Group the current hand by street

**Files:**
- Create: `web/src/ui/handLog.ts`
- Test: `web/src/ui/handLog.test.ts`

**Interfaces:**
- Produces: `type StreetName = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'`.
- Produces: `interface StreetGroup { street: StreetName; cards: string[]; pot: number; entries: LogEntry[] }`. `cards` are the card texts of that street's `streetDealt` entry split on spaces (`"As Td 3h"` → `['As','Td','3h']`), empty for preflop and showdown. `pot` is the chips in the pot when the street starts (0 for preflop).
- Produces: `groupHand(entries: LogEntry[]): StreetGroup[]`: only entries after the last `handStarted` (exclusive); a new group starts at each `flop`, `turn`, `river` entry (the entry itself is not in `entries`) and at the first `show` entry (`showdown`, the `show` entries are in it); the result lines (`win`, `returned`, `winTournament`) stay in the group where they occur.
- Pot bookkeeping per street and seat: `post` and `call` add `amount`; `raise` and `bet` set the seat's street total to `amount`; `returned` subtracts `amount`; at each new street the street totals are added to the pot and reset.

- [ ] **Step 1: Write failing tests**: two hands in the list, only the second is grouped; blinds 10/20, raise to 60, call 40, flop `As Td 3h`, check, bet 80, call 80, turn `2c` gives groups preflop (pot 0, 4 entries), flop (cards `['As','Td','3h']`, pot 120, 3 entries), turn (pot 280); a preflop fold gives one group whose last entries are `returned` and `win`; a hand with `show` entries ends with a `showdown` group.
- [ ] **Step 2: Run** `npx vitest run src/ui/handLog.test.ts`, see it fail.
- [ ] **Step 3: Implement** in `handLog.ts`.
- [ ] **Step 4: Run** lint, tsc, `npm test`.
- [ ] **Step 5: Commit** `feat(ui): group the current hand by street`.

### Task 2: The drawer component

**Files:**
- Create: `web/src/ui/HandLogDrawer.tsx`
- Modify: `web/src/ui/phrases.ts`, `web/src/locales/en.json`, `web/src/ui/styles/layout.css`, `web/src/ui/styles/tokens.css`
- Test: `web/src/ui/HandLogDrawer.test.tsx`

**Interfaces:**
- Consumes: `groupHand`, `StreetGroup` from Task 1; `logLine(entry, names, humanSeat)` from `phrases.ts`.
- Produces: `logKind(entry: LogEntry): 'aggressive' | 'plain'` in `phrases.ts`: `raise`, `bet`, `allIn` are aggressive.
- Produces: `HandLogDrawer({ entries, names, humanSeat, onClose }: { entries: LogEntry[]; names: [string, string]; humanSeat: SeatIndex; onClose: () => void })`: an `aside` with `data-testid="hand-log"`, `role="dialog"`, `aria-label={t('log.title')}`; a heading `t('log.hand', { number })` from the `handStarted` entry; a close button `data-testid="hand-log-close"` with `aria-label={t('log.close')}`; per group a `section` with the street name `t('log.street.<street>')`, the cards as small card chips (rank and suit symbol, red for hearts and diamonds), the pot (hidden for preflop) and the entries as tokens: one `span.log-token` per entry with `logLine` text and class `log-token-aggressive` when `logKind` says so. Escape (a keydown listener on `document` while mounted) calls `onClose`. A scrim `div.hand-log-scrim` (`data-testid="hand-log-scrim"`) calls `onClose` on click.
- New copy: `log.hand` = `"Hand {{number}}"`, `log.close` = `"Close hand log"`, `log.open` = `"Hand log"`, `log.street.preflop` = `"Preflop"`, `log.street.flop` = `"Flop"`, `log.street.turn` = `"Turn"`, `log.street.river` = `"River"`, `log.street.showdown` = `"Showdown"`.
- Look: phone, a drawer from the right about 310 px wide over a dim scrim, full height; desktop (the landscape media query), a floating panel about 380 px wide under the status bar, no scrim dimming (the scrim stays clickable but transparent). Colours and spacing from tokens, as in the prototype.

- [ ] **Step 1: Write failing tests**: renders street headings in order for a flop hand; the flop heading shows three card chips; tokens carry the `logLine` text ("You bet 80"); a raise token has `log-token-aggressive`; Escape and a scrim click call `onClose`; the close button calls `onClose`; only the current hand appears.
- [ ] **Step 2: Run** and see them fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** lint, tsc, `npm test`.
- [ ] **Step 5: Commit** `feat(ui): hand log drawer grouped by street`.

### Task 3: Toggle in the status bar, remove the old log

**Files:**
- Modify: `web/src/ui/StatusBar.tsx`, `web/src/ui/App.tsx`, `web/src/ui/Table.tsx`, `web/src/ui/styles/layout.css`
- Delete: `web/src/ui/HandLog.tsx` (once nothing uses it)
- Test: `web/src/ui/App.test.tsx`, `web/src/ui/copy.test.tsx`, `web/src/ui/Table.test.tsx`

**Interfaces:**
- Consumes: `HandLogDrawer` from Task 2.
- Produces: a toggle button in the status bar before the menu, `data-testid="hand-log-toggle"`, `aria-label={t('log.open')}`, `aria-expanded`, an inline stroke list icon (`aria-hidden`), 44 px tap size. `App` holds `logOpen` state, renders `HandLogDrawer` with `state.log` when open, and returns focus to the toggle on close.
- The menu no longer contains a hand log (`hand-log-menu` is gone); `Table` no longer renders `.table-side` with the log; the `coach` slot stays in the layout.

- [ ] **Step 1: Write failing tests**: `App.test.tsx`: `hand-log` is absent until `hand-log-toggle` is clicked, present after, absent after Escape, and focus is back on the toggle; `copy.test.tsx`: read the log lines from the open drawer's tokens instead of `.hand-log-lines li`, keeping the same expected texts; `Table.test.tsx`: `coach` is still rendered and no `hand-log` is inside the table.
- [ ] **Step 2: Run** and see them fail.
- [ ] **Step 3: Implement**, remove the old `HandLog` and its CSS.
- [ ] **Step 4: Run** lint, tsc, `npm test`; `npm run contact`, look at both sheets (desktop gains the space of the old column).
- [ ] **Step 5: Commit** `feat(ui): open the hand log from the status bar`.

### Task 4: e2e and docs

**Files:**
- Modify: `web/e2e/table.spec.ts` (or a new `web/e2e/log.spec.ts` included in the `small-phone` project's `testMatch` in `web/playwright.config.ts`), `web/e2e/contact.ts` (add a frame with the log open), `ARCHITECTURE.md`

- [ ] **Step 1: Write a failing e2e check** on all three projects: after the first human action, click `hand-log-toggle`; `hand-log` is visible and inside the viewport, `hand-log-close` is in the viewport, no horizontal scroll; Escape hides it.
- [ ] **Step 2: Run** `npm run test:e2e` and make it pass.
- [ ] **Step 3: Add** a "hand log" frame to the contact sheet and update `ARCHITECTURE.md` (components, test ids `hand-log-toggle`, `hand-log`, `hand-log-close`, `hand-log-scrim`; remove `hand-log-menu`; the layout no longer has the side log).
- [ ] **Step 4: Run** the full pre-PR list.
- [ ] **Step 5: Commit** `test(ui): hand log drawer checks` and `docs: hand log drawer`.
