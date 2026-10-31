# Coach insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the flop, the coach also shows what the bot's range is made of, how much of it the player is ahead
of, the player's outs with the chance to hit them, and how much of the bot's strong hands the player's cards block.

**Architecture:** Three pure modules in `src/coach/` over the hand evaluator, fed by `coachFacts`, which gains
`composition`, `outs` and `blockers`. The panel shows the composition under the range grid and the outs and blockers
in the numbers tab. No new worker or session contract: the facts are plain data on the same reply.

**Tech Stack:** TypeScript, Preact, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-coach-range-design.md`, items 5 to 7, delivery step 3.

## Global Constraints

- Branch `feat/coach-insights` stacked on `feat/coach-panel` (PR #48); the PR targets that branch.
- `coach` stays pure. No comments; ESLint size limits; UI copy in `en.json`, no all-caps, no em or en dashes.
- All three are null before the flop. Composition and blockers need the bot's range (null against the math bot);
  outs use the range when there is one and a random hand otherwise.

## Review Focus

- A paired or trips board: a pair or trips that lives only on the board is not the bot's made hand. Pinned in Task 1.
- The river: no outs (no card to come). Pinned in Task 2.
- A range whose every pair is dead or zero: shares stay finite (null composition). Pinned in Task 1.

---

### Task 1: range composition

**Files:** Create `web/src/coach/composition.ts`, test beside it.

**Interfaces (produces):**
- `type HandClass = 'strong' | 'twoPair' | 'topPair' | 'pair' | 'draw' | 'air'`;
  `classify(hole: [Card, Card], board: Card[]): HandClass`;
  `composition(weights: ArrayLike<number>, hero: [Card, Card], board: Card[]): Composition | null` with
  `Composition { shares: Record<HandClass, number>; ahead: number }`, null before the flop or with no live weight.
- Rules: `strong` is trips or better that uses a hole card, or a straight, flush, full house or better; `twoPair` when
  both hole cards pair the board or each other plus a board pair is not enough (two hole pairs only); `topPair` a hole
  pair at or above the highest board rank (top pair or overpair); `pair` any other hole pair; `draw` (flop and turn) a
  flush draw with a hole card or a straight draw with two or more ranks that complete a straight using a hole card;
  `air` the rest. `ahead` is the weighted share of live range pairs the hero's current hand beats, ties counted half.

- [ ] Tests first: classes on fixed hands (`7c 7d` on `7h Ks 2d` strong; `Kd 2c` on `Ks 2d 9h` twoPair; `Ah Kc` on
  `Ks 8d 3c` topPair; `Qc Qd` on `Js 8d 3c` topPair; `8c 9d` on `Ks 8d 3c` pair; `Ah 5h` on `Kh 8h 3c` draw;
  `9c Td` on `Js 8d 2c` draw; `Ac Qd` on `8s 8d 3c` air (board pair only); `4c 5d` on `Ks Kd Kh` air);
  composition shares sum to 1, `ahead` 1 for the nuts against a range without it, null on an empty range and
  preflop.
- [ ] Implement, run, commit `feat(coach): what the bot range is made of`.

### Task 2: outs and blockers

**Files:** Create `web/src/coach/outs.ts`, `web/src/coach/blockers.ts`, tests beside them.

**Interfaces (produces):**
- `outs(hero, board, weights | null): Outs | null`, `Outs { cards: Card[]; nextCard: number; byRiver: number | null }`:
  a card is an out when it raises the hero's hand category and leaves the hero ahead of more than half the range
  (made hands, live pairs); `nextCard = n / unseen`, `byRiver` on the flop `1 - (1 - n/47)(1 - n/46)` with `unseen`
  47 and 46, null on the turn; null on the river and preflop.
- `blockers(weights, hero, board): number | null`: of the range weight in `strong` and `twoPair` pairs (board pairs
  removed, hero cards kept), the share whose pairs hold a hero card; null with no such weight or before the flop.

- [ ] Tests first: `Ah 5h` on `Kh 8h 3c` against a random hand has the nine remaining hearts among its outs and
  `nextCard` = outs / 47; a set has no outs needed to lead but its outs list holds the full-house cards; the river
  gives null; holding `Ks` on `Kh Kd 7c` blocks part of the trips; a hero that blocks nothing gives 0.
- [ ] Implement, run, commit `feat(coach): outs and blockers`.

### Task 3: facts and panel

**Files:** Modify `web/src/coach/facts.ts`, `index.ts`, `web/src/ui/Coach.tsx` (or a new `CoachInsights.tsx`),
`en.json`, `layout.css`, `game/index.ts`, `ARCHITECTURE.md`; tests in `facts.test.ts`, `Coach.test.tsx`,
`e2e/coach.spec.ts`.

- [ ] `CoachFacts` gains `composition`, `outs`, `blockers`. Tests: preflop all three null; on a flop with a range,
  composition shares sum to 1; against the math bot composition and blockers are null and outs present.
- [ ] Range tab: `coach-composition`, one row per class with its share as a bar and a percent, then "You are ahead of
  N% of the range". Numbers tab: `coach-outs` ("9 outs: Ah 2h ...", next card and by the river), `coach-blockers`.
- [ ] e2e: on the flop with `cfr`, the range tab shows the composition. Contact screenshots on phone and desktop.
- [ ] Full pre-PR list; push; PR against `feat/coach-panel`.
