# Table Readability (Part 1: the table) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bets, the dealer button, the last action and the turn readable on the table, and put the pot to the left of the board.

**Architecture:** `game` gains the data the table needs (collected versus total pot, bet versus raise labels, actions cleared per street); `ui` renders new small felt components (`BetChips`, `DealerButton`, `ActionBubble`, a board row with the pot) and drops the tag pills. CSS changes stay in `ui/styles/layout.css` for both the room scene and the simple table.

**Tech Stack:** TypeScript strict, Preact, zustand, i18next, Vitest, @testing-library/preact, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-table-readability-design.md` (Part 1). Prototype:
https://claude.ai/artifact/VEEB6BPvVtg29hK4gUYydn

## Global Constraints

- Work from `web/`: `source ~/.nvm/nvm.sh && nvm use` before npm.
- Before each commit: `npm run lint`, `npx tsc --noEmit`, `npm test`. Before the PR also `npm run test:golden`, `npm run build`, `npm run test:e2e`.
- TDD: the failing test first. Never weaken a test, delete an assertion, add `eslint-disable` or a suppression.
- No comments in code or config.
- ESLint limits on non-test `src` files: 400 lines per file, 60 per function, nesting 3, complexity 12, 4 parameters, no import cycles.
- `ui` imports only from `game`; `game` from `cards`, `equity`, `engine`, `brains`, `cfr`.
- Every UI string comes from `src/locales/en.json`. No all-caps words, no em or en dashes as punctuation.
- Every colour, size and shadow is a token in `ui/styles/tokens.css`.
- Commits: conventional with the layer as scope (`feat(game): ...`, `feat(ui): ...`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Run `git branch --show-current` first; the branch is `feat/table-readability`.
- After a UI change: `npm run contact`, then look at `e2e/contact/phone.png` and `e2e/contact/desktop.png` once each.

## Review Focus

- An all-in for less than a call or a raise: the bubble reads "All-in" and the bet chips show the chips actually put in.
- A bet that opens the flop, turn or river reads "Bet N"; any raise preflop (the blinds are a bet) reads "Raise to N". Task 1 pins both.
- A hand that ends preflop by a fold: the bets go to the winner, no "Pot" line was ever shown, the result banner still appears. Task 3 pins the pot block with `collected` 0.
- The simple table style (`.scene-simple`) shows the same chips, button and bubbles; the contact sheet in Task 3 checks it.
- Small phone 360 × 740: the board row with the pot and the bet chips fit without horizontal scroll (`layout.spec.ts`, Task 5).

---

### Task 1: Bet versus raise labels

**Files:**
- Modify: `web/src/game/outcome.ts`, `web/src/game/session.ts` (`play`, `record`), `web/src/locales/en.json`
- Test: `web/src/game/outcome.test.ts` (create), `web/src/game/session.test.ts`, `web/src/ui/phrases.test.ts`

**Interfaces:**
- Produces: `isOpeningBet(hand: Hand, action: Action): boolean` in `outcome.ts`: true when `action.kind === 'raise'` and both `hand.bets` are 0 (preflop the blinds make it false).
- Produces: `actedLabel(event, opens: boolean): LogEntry`: with `opens` and not all-in, `{ key: 'bet', params: { amount: event.action.to } }`; otherwise as today (`raiseTo`, `call`, `check`, `fold`, `allIn`).
- Produces: `openingEntries(entries: LogEntry[], opens: boolean): LogEntry[]`: when `opens`, the entry with key `raise` becomes key `bet` with the same params.
- Produces copy: `actions.bet` = `"Bet {{amount}}"`, `log.you.bet` = `"You bet {{amount}}"`, `log.other.bet` = `"{{name}} bets {{amount}}"`.

- [ ] **Step 1: Write failing tests**
  - `outcome.test.ts`: `isOpeningBet` is false for a preflop raise over the blinds, true for a flop raise with bets `[0, 0]`, false for a flop raise after a bet, false for `call`. `actedLabel(raise to 80, true)` → `{ key: 'bet', params: { amount: 80 } }`; `actedLabel(raise to 80 all-in, true)` → `allIn`. `openingEntries([{key:'raise', params:{seat:1, amount:80}}], true)` → key `bet`.
  - `session.test.ts`: in a scripted hand (existing helpers there) where both check preflop to the flop and the first player raises to 40 on the flop, `lastActions[seat]` is `{ key: 'bet', params: { amount: 40 } }` and the last log entry for that action has key `bet`; the existing preflop `raiseTo` assertions stay.
  - `phrases.test.ts`: add `bet` to the list of action keys; `actionTag({ key: 'bet', params: { amount: 80 } })` is `"Bet 80"`; `logLine` of `{ key: 'bet', params: { seat: 0, amount: 80 } }` for the human is `"You bet 80"`.
- [ ] **Step 2: Run** `npx vitest run src/game src/ui/phrases.test.ts` and see them fail.
- [ ] **Step 3: Implement.** In `session.ts` `play`, compute `opens` from `rt.get().table.hand` before `apply`, pass it to `record(rt, events, opens = false)`, which uses `actedLabel(event, opens)` and `openingEntries(handHistory(events), opens)`. Add the copy keys.
- [ ] **Step 4: Run** the tests, then lint, tsc, `npm test`.
- [ ] **Step 5: Commit** `feat(game): label an opening bet as bet, not raise`.

### Task 2: View-model for the table

**Files:**
- Modify: `web/src/game/viewModel.ts`, `web/src/game/session.ts` (`record`), `web/src/ui/Table.tsx`, `web/src/ui/Pot.tsx`, `web/src/ui/ActionBar.tsx`, `web/src/ui/fixtures.ts`
- Test: `web/src/game/viewModel.test.ts`, `web/src/game/session.test.ts`, `web/src/ui/Pot.test.tsx`, `web/src/ui/ActionBar.test.tsx`

**Interfaces:**
- Consumes: `actions.bet` from Task 1.
- Produces: `ViewModel.pot: { collected: number; total: number }`. `total` is `hand.pot` (0 with no hand); `collected` is `total - bets[0] - bets[1]`.
- Produces: `RaiseControl.kind: 'bet' | 'raise'`: `'bet'` when both `hand.bets` are 0.
- Produces: `lastActions` reset to `[null, null]` by `record` when the events contain `streetDealt`.
- Produces: `Pot({ collected, total })` renders, for now, `pot.amount` with `total` and `data-amount={total}`, `data-collected={collected}` (Task 3 changes the look).
- Produces: `ActionBar` raise button text `t('actions.bet', { amount })` when `raise.kind === 'bet'`.

- [ ] **Step 1: Write failing tests**
  - `viewModel.test.ts`: after blinds 10/20, `pot` is `{ collected: 0, total: 30 }`; on the flop after a 60/60 preflop, `{ collected: 120, total: 120 }`; after a flop bet of 80, `{ collected: 120, total: 200 }`. `controls.raise.kind` is `'raise'` preflop and `'bet'` on the flop before any bet.
  - `session.test.ts`: after the flop is dealt, `lastActions` is `[null, null]`.
  - `Pot.test.tsx`: `render(<Pot collected={120} total={200} />)` has `data-amount="200"` and `data-collected="120"`.
  - `ActionBar.test.tsx`: with `raise.kind = 'bet'` and amount 60 the raise button reads `"Bet 60"`.
- [ ] **Step 2: Run** them and see them fail.
- [ ] **Step 3: Implement**, updating `fixtures.ts` (`pot: { collected: 0, total: 140 }`, `raise.kind: 'raise'`) and `Table.tsx` (`<Pot {...vm.pot} />`).
- [ ] **Step 4: Run** lint, tsc, `npm test`.
- [ ] **Step 5: Commit** `feat(game): collected and total pot, bet kind, actions cleared per street`.

### Task 3: Felt components and layout

**Files:**
- Create: `web/src/ui/BetChips.tsx`, `web/src/ui/DealerButton.tsx`, `web/src/ui/ActionBubble.tsx`, `web/src/ui/BoardRow.tsx`
- Modify: `web/src/ui/Seat.tsx`, `web/src/ui/Pot.tsx`, `web/src/ui/Board.tsx`, `web/src/ui/Table.tsx`, `web/src/ui/phrases.ts`, `web/src/ui/styles/layout.css`, `web/src/ui/styles/tokens.css`, `web/src/locales/en.json`
- Test: `web/src/ui/BetChips.test.tsx`, `web/src/ui/ActionBubble.test.tsx`, `web/src/ui/BoardRow.test.tsx`, `web/src/ui/Pot.test.tsx`, `web/src/ui/Table.test.tsx`, `web/src/ui/App.test.tsx`, `web/src/ui/copy.test.tsx`

**Interfaces:**
- Consumes: `ViewModel.pot`, `SeatView` (`bet`, `isButton`, `isToAct`, `lastAction`).
- Produces: `BetChips({ seat: SeatIndex, amount: number })`: nothing when `amount` is 0; else a decorative two-chip stack (`aria-hidden`) and the amount, `data-testid="bet-<seat>"`, accessible text `t('seat.bet', { amount })`.
- Produces: `DealerButton()`: the ivory disc, `role="img"`, `aria-label={t('seat.dealerLabel')}`, `data-testid="dealer-button"`.
- Produces: `actionKind(entry: LogEntry): 'passive' | 'aggressive' | 'fold'` in `phrases.ts`: `check`, `call` passive; `bet`, `raiseTo`, `allIn` aggressive; `fold` fold.
- Produces: `ActionBubble({ seat, entry: LogEntry | null, thinking: boolean })`: thinking shows `t('seat.thinking')` with `data-testid="thinking-<seat>"`; otherwise `actionTag(entry)` with `data-testid="action-<seat>"` and class `bubble-<kind>`; nothing when both are empty.
- Produces: `Pot({ collected, total })`: the chips and `t('pot.amount', { amount: collected })` only when `collected > 0`; `t('pot.total', { amount: total })` (new copy `"Total {{amount}}"`) only when `total > collected`; keeps `data-testid="pot"`, `data-amount={total}`, `data-collected={collected}`.
- Produces: `Board({ cards })` renders 5 slots: the cards, then empty `.board-slot` placeholders (`aria-hidden`).
- Produces: `BoardRow({ pot, board })`: one row, the pot block on the left aligned to the board, the board on the right.

Layout, as in the prototype, both scenes: bot bubble above the bot plaque; the plaque holds only name and stack; bot `BetChips` between the bot and the board row; the board row in the centre of the felt; human `BetChips` between the row and the human cards; `DealerButton` on the felt next to the button seat's bet spot; the human bubble above the human plaque; the turn highlight is a 2 px accent ring plus `--shadow-glow` on the plaque of the seat to act. Bubble colours: passive `--color-text` on `--color-accent-text` text, aggressive `--color-accent`, fold muted; add tokens if a value is new.

- [ ] **Step 1: Write failing tests** for `BetChips` (0 renders nothing; 60 renders `bet-1` with "60"), `ActionBubble` (each kind class; thinking wins over an entry), `Pot` (collected 0 and total 30 shows only "Total 30"; 120/120 shows only "Pot 120"; 120/200 shows both), `Board` (2 cards → 2 cards and 3 slots), `BoardRow` (pot before board in DOM order), `Table.test.tsx` (`dealer-button` rendered once, next to the button seat; no `.tag-bet`). Update `App.test.tsx` and `copy.test.tsx` only where they read the removed tag classes, keeping every assertion's intent.
- [ ] **Step 2: Run** `npx vitest run src/ui` and see them fail.
- [ ] **Step 3: Implement** components and CSS for the room scene and `.scene-simple`; portrait (phone) and landscape layouts.
- [ ] **Step 4: Run** lint, tsc, `npm test`; `npm run contact`, look at both sheets; fix overlaps until the human to act, after flop, showdown, bot thinking and cash hand over frames read like the prototype.
- [ ] **Step 5: Commit** `feat(ui): bet chips, dealer button, action bubbles and the pot beside the board`.

### Task 4: Bets sweep into the pot

**Files:**
- Create: `web/src/ui/useSweep.ts`
- Modify: `web/src/ui/Table.tsx`, `web/src/ui/BetChips.tsx`, `web/src/ui/styles/layout.css`
- Test: `web/src/ui/useSweep.test.tsx`

**Interfaces:**
- Produces: `useSweep(bets: [number, number], collected: number, ms = 300): [number, number]` returns the bets to draw: when the bets drop to 0 and `collected` grows, it keeps the previous bets for `ms` and then returns `[0, 0]`; otherwise it returns `bets`. `BetChips` takes `sweeping?: boolean` and adds class `bet-sweep`, a CSS transition toward the board row; under `prefers-reduced-motion: reduce` the class has no transition.

- [ ] **Step 1: Write failing tests** with fake timers: bets `[60, 60]` → `[0, 0]` with `collected` 0 → 120 keeps `[60, 60]` until 300 ms, then `[0, 0]`; bets that drop because a new hand started (collected goes to 0) return `[0, 0]` at once.
- [ ] **Step 2: Run** and see them fail.
- [ ] **Step 3: Implement** and wire it in `Table.tsx`.
- [ ] **Step 4: Run** lint, tsc, `npm test`, `npm run contact`.
- [ ] **Step 5: Commit** `feat(ui): sweep the street bets into the pot`.

### Task 5: Contract, e2e and docs

**Files:**
- Modify: `ARCHITECTURE.md` (ui section: components list, test ids `dealer-button`, `pot` with `data-collected`, the bubble on `action-<i>`), `web/e2e/layout.spec.ts`, `web/e2e/game.spec.ts` only if a selector changed
- Test: `web/e2e/layout.spec.ts`

- [ ] **Step 1: Write a failing e2e check** in `layout.spec.ts`: on every project, on the human's first turn, `dealer-button`, `bet-0`, `bet-1`, `pot` and `board` are visible and inside the viewport, and the page has no horizontal scroll.
- [ ] **Step 2: Run** `npm run test:e2e` and make it pass (layout fixes go in `layout.css`).
- [ ] **Step 3: Update** `ARCHITECTURE.md`.
- [ ] **Step 4: Run** the full pre-PR list: lint, tsc, `npm test`, `npm run test:golden`, `npm run build`, `npm run test:e2e`.
- [ ] **Step 5: Commit** `test(ui): table layout checks` and `docs: table components and test ids`.
