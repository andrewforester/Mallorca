# Natural style, characters and the bluff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the addendum into PR #171: personality without self-control, the natural style from leading traits,
34 characters with their sheets, belief in the pot and who decided the outcome instead of the bluff events,
certainty, and the mood's pull to rest.

**Architecture:** `src/emotion` stays pure. `style.ts` gets the leading-trait weights, `profiles.ts` the 34
personalities, `tension.ts` the belief, `appraisal.ts` the new events, `emotions.ts` and `mood.ts` the certainty and
the pull, `play.ts` the four-number affect. The character sheets (name, short, about, poker) live in `src/persona`.
`src/persona/perception.ts` emits the new events and loses the bluff heuristic.

**Tech Stack:** TypeScript, Vitest, Preact, Vite. Commands from `web/` after `source ~/.nvm/nvm.sh && nvm use`.

**Spec:** `docs/superpowers/specs/2026-11-10-natural-style-and-bluff-design.md` (branch
`docs/natural-style-and-bluff`, brought into this branch in Task 0), an addendum to
`docs/superpowers/specs/2026-11-10-emotion-play-model-design.md`. The addendum wins where they differ.

## Owner's decisions on the open points (2026-11-10)

- A call by the opponent is a new event, `opponentCall`, which resets the fold chance.
- `foldChance = bet / (pot before the bet + bet)`.
- Her own bet has no impulses of its own: belief carries it (checked on numbers: a bluff of 15 into 20 at 10% raises
  the tension from 0.14 to 0.58, felt as fear by the anxious and as hope by the bold; pride comes when he folds).
- The pull to rest applies to approach and certainty only, as in the prototype.
- Composure and discipline by the proposal of section 1.
- Every character gets a name, a short description ("a good-natured retiree", "a tired mum"), a fuller description of
  the person and a description of her poker style, all in the persona. The start screen keeps the nine of PR #171;
  the owner chooses later.

## Global Constraints

- No comments in code or config. Files ≤ 400 lines, functions ≤ 60, nesting ≤ 3, complexity ≤ 12, ≤ 4 parameters.
- `src/emotion` imports nothing from other layers; no `Math.random`, `Date` or timers there.
- Failing test first in every task; never weaken a test or add a suppression.
- Before every commit: `npm run lint`, `npx tsc --noEmit`, `npm test`; `git branch --show-current` is
  `feat/emotion-play-model`.
- Copy in English, no all-caps words, no em or en dashes as sentence punctuation.
- Constants verbatim from the addendum: `STYLE_SHARE = 0.7`, the weight table of section 2, the `CERTAINTY` table and
  the four-weight `PLAY_AXES` of section 4, composure `clamp(0.55 − 0.35·N + 0.1·C, 0.15, 1.1)`, discipline
  `clamp(0.45 + 0.4·C − 0.1·N, 0, 0.95)`, coping `σ(−1.2·N + 0.6·E − 0.5·A)`.
- `sessionPayloads.json` is re-recorded in its own `test(game)` commit after each task that changes her feeling on
  purpose, after checking which fields moved.

## Review Focus

- The affect's certainty is not zero while (P, A, approach) is zero: intensity 0 must give push 0, no division by
  zero, the rest style. Test in Task 4.
- A bet of zero or a pot of zero: `foldChance` stays in [0, 1) and belief in [0, 1], no NaN. Test in Task 5.
- `opponentCall` or `opponentBet` with no bet of hers before: nothing changes but the fold chance stays 0. Test in
  Task 5.
- A pure bluff through (`decided: 'heFolded'`, equity 0): luck 0, pride by coping, no surprise, no NaN. Test in
  Task 5.
- `setPersonality` mid-session keeps certainty and the fold chance. Test in Task 3.

---

### Task 0: Bring the addendum into the branch

- [ ] **Step 1:** `git checkout origin/docs/natural-style-and-bluff -- docs/superpowers/specs/2026-11-10-natural-style-and-bluff-design.md`
- [ ] **Step 2: Commit** with this plan — `docs: plan for the natural style, the characters and the bluff`

---

### Task 1: Personality without self-control

**Files:** Modify `src/emotion/personality.ts`, `src/emotion/profiles.ts` (drop `control`), `src/game/debugView.ts`,
`src/ui/debug/PersonalitySection.tsx`, `src/ui/debug/copy.ts`, `tools/arena/profileBots.ts`,
`prototypes/emotion-lab/ui/panels.ts`, `prototypes/emotion-lab/report.ts`. Tests: `src/emotion/emotion.test.ts`,
`src/emotion/profiles.test.ts`, `src/game/debugView.test.ts`, `src/ui/debug/EmotionDebug.test.tsx`,
`tools/arena/profileBots.test.ts`.

**Interfaces:** Produces `Personality { bigFive: BigFive; suppression: number }`; `Traits` unchanged in shape.

- [ ] **Step 1: Failing tests**
  - Mallorca: composure `0.55 − 0.35·0.1 + 0.1·0.2` = 0.535, discipline `0.45 + 0.08 − 0.01` = 0.52, coping
    `σ(−0.12 + 0.24 − 0.25)` (to 1e-12).
  - Clamps: N 1, C −1 gives composure 0.15; C 1, N −1 gives discipline 0.95.
  - Every profile has exactly the keys `bigFive` and `suppression`.
  - `debugView` has no `control`; the panel has no "Self-control" slider; `persona:nina@control=0.5` is not a bot
    name.
- [ ] **Step 2:** `npx vitest run src/emotion src/game tools/arena src/ui/debug` — FAIL.
- [ ] **Step 3:** Implement; follow the type errors.
- [ ] **Step 4:** Same command — PASS; `npm test` — PASS except the payload fixture.
- [ ] **Step 5: Commit** `feat(emotion): a character is the Big Five and her poker face habit`, then the fixture.

---

### Task 2: Natural style from leading traits

**Files:** Modify `src/emotion/style.ts`. Test `src/emotion/style.test.ts`.

**Interfaces:** Produces `STYLE_SHARE = 0.7`, `STYLE_WEIGHTS: Record<BiasKey, BigFive>` (replaces
`STYLE_COEFFICIENTS`), `natureOf(b)` = `Σ w·t / (0.8 · max|w|)` (not clamped to [−1, 1]).

- [ ] **Step 1: Failing tests**
  - `STYLE_WEIGHTS` equals the section 2 table.
  - The nine of PR #171 have the rest styles of section 3, "The nine characters ... under the new weights", each
    value within 0.006.
  - The 32 profiles with every trait ±0.8 reach all 16 corners of (aggression, looseness, bluff, stickiness) relative
    to 1, two profiles each, and the two of a corner differ in sizing side.
  - The average character is 1 on every axis; 200 random Big Five vectors in [−1, 1] stay strictly inside (0.5, 2).
- [ ] **Step 2:** `npx vitest run src/emotion/style.test.ts` — FAIL.
- [ ] **Step 3:** Implement. Update `src/emotion/sessions.test.ts`'s rest order to the new rest styles only as far as
      needed to stay green; Task 6 rewrites that file.
- [ ] **Step 4:** `npm test` — PASS except the fixture.
- [ ] **Step 5: Commit** `feat(emotion): her natural style follows one leading trait per axis`, then the fixture.

---

### Task 3: Thirty-four characters and their sheets

**Files:** Modify `src/emotion/profiles.ts` (34 personalities, one line each through a helper so the file stays
under 400 lines). Create `src/persona/characters.ts`. Modify `src/persona/index.ts`, `src/game/index.ts`,
`src/ui/debug/PersonalitySection.tsx`, `src/ui/debug/copy.ts`. Tests `src/emotion/profiles.test.ts`,
`src/persona/characters.test.ts`, `src/ui/debug/EmotionDebug.test.tsx`, `src/emotion/emotion.test.ts`.

**Interfaces:**

- Produces `PERSONALITIES` with keys in this order: the nine of PR #171 (`mallorca, ingrid, mira, nina, lola, sol,
rita, vera, greta`), the 16 extremes in the order of the section 3 table, the 8 intermediate in theirs, `neutral`.
- Produces `CharacterSheet { name: string; short: string; about: string; poker: string }` and
  `CHARACTER_SHEETS: Readonly<Record<PersonalityKey, CharacterSheet>>` in `src/persona/characters.ts`.
- `CHARACTERS` of `game` (the start screen) is unchanged: the nine.

The 25 new characters: Big Five verbatim from section 3 (extremes ±0.8), suppression
`round2(clamp(0.35 + 0.3·C − 0.3·E, 0.05, 0.9))`, the existing ten keep theirs. Copy: every name a distinct woman's
first name (her face is one woman's); `short` is who she is in life in a few words, lower case ("a good-natured
retiree", "a tired mum of three"); `about` two or three sentences about the person, following the section 3 person;
`poker` one or two sentences in plain words following her rest style and the "Poker manner" of section 3 (for the
nine, the addendum's new manner). The nine keep their names.

- [ ] **Step 1: Failing tests**
  - Keys and their order as above, 34 in all; each Big Five equals section 3 (extremes ±0.8, intermediate verbatim).
  - Every sheet has a non-empty `name`, `short`, `about`, `poker`; names are distinct; no text has an em or en dash
    or a word of two capital letters; `short` starts lower case.
  - The debug panel shows a button per key labelled with the sheet's name, with `short` as its title.
  - `setPersonality` keeps certainty and the fold chance (added in Tasks 4 and 5: write this test there).
- [ ] **Step 2:** `npx vitest run src/emotion src/persona src/ui/debug` — FAIL.
- [ ] **Step 3:** Implement; the debug copy reads names from the sheets instead of its own `personality` map.
- [ ] **Step 4:** `npm test` — PASS.
- [ ] **Step 5: Commit** `feat(persona): thirty-four characters, each with a name, a life and a poker style`.

---

### Task 4: Certainty, the pull to rest and the four-number affect

**Files:** Modify `src/emotion/emotions.ts`, `src/emotion/mood.ts`, `src/emotion/engine.ts`, `src/emotion/play.ts`,
`src/game/debugView.ts`, `src/ui/debug/StateSection.tsx`, `src/ui/debug/copy.ts`, `prototypes/emotion-lab/main.ts`.
Tests `src/emotion/emotion.test.ts`, `src/emotion/play.test.ts`, `src/emotion/profiles.test.ts`,
`src/game/debugView.test.ts`, `src/ui/debug/EmotionDebug.test.tsx`.

**Interfaces:**

- Produces `CERTAINTY: Record<Emotion, number>` (section 4 table); `type Affect = readonly [number, number, number,
number]`; `stepAxis(value: number, e: Emotions, weights: Record<Emotion, number>, dt: number, config: MoodConfig):
number` replacing `stepApproach`; `Snapshot.certainty: number`; `Snapshot.affect: Affect`.
- `affectOf(e, moodShift, approach, certainty, urgency): Affect` — certainty part `Σ e·CERTAINTY + 2·certainty`;
  `PLAY_AXES: Record<BiasKey, Affect>` (section 4 table); `playOf(affect, traits)`: intensity is the length of the
  first three numbers, push uses all four.

- [ ] **Step 1: Failing tests**
  - `CERTAINTY` equals the section 4 table; `PLAY_AXES` equals the section 4 axis table.
  - `stepAxis`: a single joy of 0.06 held for 600 s leaves approach below 0.02 (the pull wins over small emotions);
    anger 0.8 for 600 s still raises approach above 0.2; without emotions 0.5 returns to 0 without overshoot.
  - The push at 1 of each emotion (section 4 table "The push of each emotion at 1") for bluff, sizing and looseness,
    computed as `PLAY_AXES[k] · (P, A, approach, certainty)` of that emotion, within 0.01.
  - Review Focus: an affect `[0, 0, 0, 0.5]` gives intensity 0, push 0 and the rest style.
  - `setPersonality` keeps `certainty`.
  - Debug view and panel: "Certainty" under the mood.
- [ ] **Step 2:** `npx vitest run src/emotion src/game src/ui/debug` — FAIL.
- [ ] **Step 3:** Implement. PAD keeps its own step; approach and certainty use `stepAxis`: push toward the centre
      at `intensity / changeTimeS`, then pull toward 0 at `√3 / returnTimeS`, every step.
- [ ] **Step 4:** `npm test` — PASS except the fixture.
- [ ] **Step 5: Commit** `feat(emotion): certainty on every emotion and in her mood, which keeps returning to rest`,
      then the fixture.

---

### Task 5: Belief in the pot and who decided the outcome

**Files:** Modify `src/emotion/appraisal.ts`, `src/emotion/tension.ts`, `src/emotion/engine.ts`,
`src/persona/perception.ts`, `src/ui/debug/events.ts`, `src/game/records/feelings.ts`,
`prototypes/emotion-lab/scenes/runner.ts`. Tests `src/emotion/appraisal.test.ts`, `src/emotion/tension.test.ts`,
`src/emotion/emotion.test.ts`, `src/persona/perception.test.ts`, `src/persona/persona.test.ts`,
`src/ui/debug/events.test.ts`, `src/conversation/speaking.test.ts`.

**Interfaces:**

- `TableEvent` loses `bluff`, `mistake` and `ownMove` fold; `ownMove` bet becomes `{ kind: 'ownMove'; move: 'bet';
amountBb: number; potBb: number; equity: number }` (pot before her bet); adds `{ kind: 'opponentCall' }`;
  `result` gains `decided: 'showdown' | 'heFolded' | 'sheFolded'`.
- `tension.ts`: `foldChanceOf(betBb: number, potBb: number): number` = `bet / (pot + bet)` (0 when both are 0);
  `beliefOf(equity: number, foldChance: number): number` = `fc + (1 − fc)·equity`.
- The engine holds `foldChance`: set by her bet, reset to 0 by `opponentCall`, `opponentBet`, `deal` and `result`.
  Tension, leaning and the `expected` of a result read the belief.
- Appraisal: `ownMove` bet and `opponentCall` give no impulses. `result`:
  - `heFolded`: luck 0, `self = coping`, `opponent = 1 − coping`, unexpected 0;
  - `showdown`: as today, with `expected` = belief (equals equity, since he called);
  - `sheFolded`: `value = −0.35 · scaled(|net|) · smoothstep(0.35, 0.75, belief)`, opponent 1, resolved 1,
    `expected = belief`; value 0 relieves the fear she holds.
- `perception.ts`: emits the bet with the pot, `opponentCall` on his call, `decided` from the hand (showdown, or who
  folded); `riverCall`, `bluffed` and the `mistake` and `bluff` events go.

- [ ] **Step 1: Failing tests**
  - `foldChanceOf(15, 20)` is 15/35; `foldChanceOf(0, 0)` is 0; `beliefOf(0.1, 15/35)` is 0.4857 (1e-4); belief stays
    in [0, 1] at equity 0 and 1.
  - Engine: deal at 0.1 on the river (pot 20), her bet of 15: Nina's fear target and Rita's hope target rise above
    their values before the bet; `opponentCall` brings belief back to equity; an `opponentCall` with no bet changes
    nothing.
  - A bluff through (`result`, +20, `decided: 'heFolded'`, equity 0): pride = `m · coping · gain`, no surprise, no
    NaN. A bluff caught (showdown, −15, belief 0.1): shame for selfBlame 0.89, anger for selfBlame 0.1 with coping
    0.75.
  - She folds junk preflop (`sheFolded`, −0.5, belief 0.35): no distress, no shame; relief equals the fear she holds.
  - Perception: a hand where she bets the river and he folds sends `ownMove` with the pot and a `result` with
    `heFolded`; a hand where he calls her sends `opponentCall`; no `bluff` or `mistake` event is ever sent.
  - Review Focus: `setPersonality` keeps the fold chance.
- [ ] **Step 2:** `npx vitest run src/emotion src/persona src/conversation src/ui/debug src/game` — FAIL.
- [ ] **Step 3:** Implement. Update reader tests that pinned the removed events to the general rule (caught bluff
      feels shame or anger by self-blame).
- [ ] **Step 4:** `npm test` — PASS except the fixture.
- [ ] **Step 5: Commit** `feat(emotion): she weighs a pot by her belief in winning it and by who decided it`, then
      the fixture.

---

### Task 6: The reference session of the addendum

**Files:** Rewrite `src/emotion/sessions.test.ts`.

- [ ] **Step 1:** Script as today plus two scenes 15 s apart: her bluff caught at the river (bet 15 into 20 at
      equity 0.1, `opponentCall`, showdown loss) and her bluff through (bet 15 into 20, `heFolded`). Quiet hands: she
      folds hers (`sheFolded`), he folds his (`heFolded`), alternately. Assert the shapes of section 6:
  - rest aggression order rita > sol > lola > mallorca > ingrid > nina > greta;
  - Rita's aggression above her rest after the losses; Nina, Greta, Mira and Vera below theirs;
  - Ingrid within 0.05 of her rest on every axis at every column;
  - neutral within 0.15 of rest on every axis after five quiet minutes;
  - on the heater every axis but looseness above rest, for every character;
  - Lola's bluff above her rest at the bad beat and after the bluff through;
  - after the bluff caught, Mira's, Nina's and Greta's bluff below their rest, Rita's at or above hers;
  - every value at every step strictly inside (0.5, 2).
- [ ] **Step 2:** `npx vitest run src/emotion/sessions.test.ts` — PASS. A shape that fails is a finding: trace it,
      fix the cause if it is a defect, otherwise record a ruling and report the gap in the PR; do not drop the assertion.
- [ ] **Step 3: Commit** `test(emotion): the reference session of the addendum`.

---

### Task 7: Docs, the lab and the full check

**Files:** `docs/emotion/README.md` (personality, style, appraisal of the outcome, certainty, mood pull, the
reference table of section 6, the characters), `ARCHITECTURE.md` (emotion, persona, debug view, arena bots),
`web/tools/arena/README.md`, `docs/emotion/generated.md` (`npm run lab:report`).

- [ ] **Step 1:** Update the docs.
- [ ] **Step 2:** `npm run lint && npx tsc --noEmit && npm test && npm run test:golden && npm run build &&
E2E_PORT=4832 npm run test:e2e -- --trace off` — all PASS.
- [ ] **Step 3:** `CONTACT_PORT=4831 npm run contact`; look at both sheets once.
- [ ] **Step 4:** Arena smoke `npm run arena -- --a persona:rita --b persona:nina --pairs 200`.
- [ ] **Step 5: Commit** `docs: the natural style, the characters and the bluff in the README and the architecture`.

Then the whole-branch review by a fresh reviewer, its fixes, and an update of PR #171.
