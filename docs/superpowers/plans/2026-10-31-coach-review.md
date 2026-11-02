# Coach review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In coach mode every player decision is graded against the strategy's hint of that spot; after a hand the
coach shows the review of the hand, and over the session it shows the player's leaks against the strategy.

**Architecture:** Pure `coach/review.ts` (grade, chosen move), `coach/spots.ts` (which leak spot a decision is in,
from the hand's engine events) and `coach/leaks.ts` (player and strategy frequencies per spot). The session's coach
controller (`game/coach.ts`) turns the current facts and the player's action into a `CoachDecision`, keeps the
hand's and the session's decisions in `CoachState`, and the recorder stores the hand's decisions in the record.

**Tech Stack:** TypeScript, Preact, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-coach-range-design.md`, items 8 and 9, delivery step 4.

## Global Constraints

- Branch `feat/coach-review` stacked on `feat/coach-insights` (PR #49); the PR targets that branch.
- Grades: `strategy` at a frequency of 25 % or more, `rare` from 5 % to 25 %, `off` under 5 %.
- A leak line shows only with at least 10 spots.
- `HandRecord` stays version 1: `coach` is an optional field, absent when no decision was coached.
- No comments; ESLint limits; copy in `en.json`.

## Review Focus

- A decision with no facts (coach off, waiting, unavailable) is not graded and not recorded.
- A raise of a size the strategy does not use maps to the nearest sized move, all-in included.
- The review of a hand clears when the next hand starts; the session log survives hands.

---

### Task 1: grade and spots

**Files:** Create `web/src/coach/review.ts`, `web/src/coach/spots.ts`, tests beside them.

**Interfaces (produces):**
- `Grade = 'strategy' | 'rare' | 'off'`, `grade(frequency: number): Grade`;
  `chosenMove(action: Action, moves: CoachMove[]): number | null`;
  `CoachDecision { street: BettingStreet; action: Action; moves: CoachMove[]; mine: number[]; approximate: boolean; chosen: number | null; frequency: number | null; grade: Grade | null; spot: SpotTag | null }`;
  `reviewDecision(hint: Hint, action: Action, street: BettingStreet, spot: SpotTag | null): CoachDecision`.
- `SpotTag = 'open' | 'threeBet' | 'foldToThreeBet' | 'cbet' | 'foldToCbet' | 'turnBet' | 'riverBet' | 'riverFold'`;
  `spotOf(events: EngineEvent[], seat: SeatIndex): SpotTag | null` from the hand's events before the decision:
  `open` the button's first preflop action with no raise; `threeBet` the big blind facing one raise; `foldToThreeBet`
  a player who raised facing a re-raise; `cbet` the flop with no bet yet by the last preflop raiser; `foldToCbet` the
  flop facing the preflop raiser's first bet; `turnBet` and `riverBet` the turn and river with no bet to face;
  `riverFold` the river facing a bet.

- [ ] Tests first on hand-built event lists for each tag and for null (a limped pot's big blind check), and for
  grades at 0.25, 0.05 and 0.049, and chosen moves (a raise to 75 between bets of 50 and 100 maps to the nearer).
- [ ] Implement, run, commit `feat(coach): grade a decision and name its spot`.

### Task 2: leaks

**Files:** Create `web/src/coach/leaks.ts`, test beside it.

- `LEAK_SPOTS: Record<SpotTag, 'aggressive' | 'fold'>` (fold for `foldToThreeBet`, `foldToCbet`, `riverFold`);
  `MIN_SPOTS = 10`; `leaks(decisions: CoachDecision[]): Leak[]`, `Leak { spot; spots; player; strategy }`: per tag,
  the share of decisions whose action is of the tag's kind, and the mean strategy share of moves of that kind.
- [ ] Tests first: two decisions in `open`, one raised, with strategy raise shares 0.8 and 0.6 give
  `{ spots: 2, player: 0.5, strategy: 0.7 }`; decisions without a spot are left out; tags come in a fixed order.
- [ ] Implement, run, commit `feat(coach): leaks against the strategy`.

### Task 3: session, records

**Files:** Modify `web/src/game/coach.ts`, `session.ts`, `records/record.ts`, `records/recorder.ts`, `index.ts`;
tests beside them.

- `CoachState` gains `review: CoachDecision[]` (this hand) and `log: CoachDecision[]` (this session);
  `Coach.played(action): CoachDecision | null` grades the action against ready facts with `spotOf` of the hand's events;
  `HandRecorder.coached(decision, events)` stores it with its `eventIndex`; `HandRecord.coach?` holds them.
- [ ] Tests first: a coached action lands in `review`, `log` and the saved record with the `acted` index; a hand with
  no coached decision has no `coach` field; `review` clears at the next hand while `log` keeps growing.
- [ ] Implement, run, commit `feat(game): coached decisions in the session and the hand records`.

### Task 4: panel

**Files:** Create `web/src/ui/CoachReview.tsx`; modify `Coach.tsx`, `useCoach.tsx`, `en.json`, `layout.css`; tests.

- Between hands the panel shows `coach-review`: one row per decision with the street, the action, the grade and the
  strategy's top shares. A `coach-tab-session` tab, and the panel between hands, show `coach-leaks` (lines with 10 or
  more spots, else a line saying how leaks appear).
- [ ] Tests first, implement, e2e (after a coached hand the review appears), screenshots, docs, full checks, PR.
