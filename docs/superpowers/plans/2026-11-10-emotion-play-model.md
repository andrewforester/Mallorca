# Emotion play model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the emotion engine's special-case appraisal and its load/bias mapping with one general model, and
put nine characters on the start screen.

**Architecture:** `src/emotion` stays a pure layer. Events are appraised on general axes (`appraisal.ts`), axes become
impulses by one set of formulas (`feelings.ts`), hope and fear inside a hand track a tension target (`tension.ts`),
the mood gains an approach dimension (`mood.ts`), and the play style is a projection of the affect (`play.ts`,
`style.ts`). Readers keep the `Snapshot` shape where they depend on it (`load.overload`, `mood`, `bias`).

**Tech Stack:** TypeScript, Vitest, Preact, Vite. Commands run from `web/` after `source ~/.nvm/nvm.sh && nvm use`.

**Spec:** `docs/superpowers/specs/2026-11-10-emotion-play-model-design.md`. The prototype that produced the reference
numbers is in the session scratchpad (`proto.ts`, `model.ts`, `types.ts`, `scenarios.ts`); the spec is the contract.

## Global Constraints

- No comments in code or config. Files ≤ 400 lines, functions ≤ 60, nesting ≤ 3, complexity ≤ 12, ≤ 4 parameters.
- `src/emotion` imports nothing from other layers; no `Math.random`, `Date` or timers there.
- Never weaken a test or add a suppression; failing test first in every task.
- Commit scopes: `feat(emotion)`, `feat(persona)`, `feat(face)`, `feat(game)`, `feat(ui)`, `refactor(arena)`, `docs`.
  Run `git branch --show-current` (expect `feat/emotion-play-model`) before each commit.
- Before every commit: `npm run lint`, `npx tsc --noEmit`, `npm test`.
- UI copy: no all-caps words, no em or en dashes as sentence punctuation.
- Constants, verbatim from the spec: `STAKE_BB = 20`, `ATTACK_S = 0.5`, `RELEASE_S = 1.5`, hope up 0.8 s, fear up
  0.25 s, `EQUITY_LEANING = 0.5`, `STYLE_SHARE = 0.8`, `MOOD_WEIGHT = 2`, `PUSH_GAIN = 2`, `URGENCY_PUSH = 0.8`,
  `GAME_MOOD = { changeTimeS: 600, returnTimeS: 1200 }`.

## Review Focus

- A hand where her equity does not change between streets: no street impulses, no division by zero in `resolved`.
- An empty or all-zero emotional state: `intensity = 0` must give `reach = 0`, `push = 0`, the rest style, no NaN.
- Equity exactly 0 or 1 (a made nut or a dead hand): `leaning` clamps the logit, tension is 0, nothing is NaN.
- A personality slider at an edge (Big Five ±1, control 0 or 1): every style value strictly inside (0.5, 2).
- `setPersonality` mid-session keeps emotions, mood, approach, pending impulses and pressure.

Each line has its test in the owning task below.

---

### Task 1: Personality without experience; stances and nature

**Files:**

- Modify: `src/emotion/personality.ts`, `src/emotion/style.ts`, `src/emotion/profiles.ts`, `src/emotion/index.ts`
- Modify (compile follow-through): `src/game/debugView.ts`, `src/ui/debug/PersonalitySection.tsx`,
  `src/ui/debug/copy.ts`, `tools/arena/profileBots.ts`, `prototypes/emotion-lab/report.ts`,
  `prototypes/emotion-lab/ui/panels.ts`
- Test: `src/emotion/style.test.ts`, `src/emotion/profiles.test.ts`, `src/emotion/emotion.test.ts` (personality block),
  `tools/arena/profileBots.test.ts`, `src/game/debugView.test.ts`

**Interfaces:**

- Produces: `Personality { bigFive: BigFive; suppression: number; control: number }`.
- Produces: `Traits` gains `selfBlame: number`, `coping: number`, `urgency: number`,
  `nature: Readonly<Record<BiasKey, number>>`; `baseline: PlayBias` now means the style at rest.
- Produces in `style.ts`: `STYLE_SHARE = 0.8`, `natureOf(b: BigFive): Record<BiasKey, number>` (in [-1, 1]),
  `styleFrom(nature: Readonly<Record<BiasKey, number>>, push: Readonly<Record<BiasKey, number>>): PlayBias`,
  `styleOf(b: BigFive): PlayBias` (= `styleFrom(natureOf(b), zeros)`).

- [ ] **Step 1: Write the failing tests**

`style.test.ts`:

- `natureOf` of the neutral Big Five is 0 on every axis; of a profile with every trait at the sign of its coefficient
  is 1 on that axis (use `STYLE_COEFFICIENTS.aggression` signs).
- `styleOf` of that extreme profile gives aggression `2 ** 0.8` (±1e-9); of its mirror `2 ** -0.8`.
- `styleFrom(nature, push)` with nature 1 and push 50 is `< 2` and `> 1.999`; with push −50 is `> 0.5`.
- For 200 random Big Five vectors in [-1, 1] from `mulberry32(7)` (import from `../cards/index.ts` is not allowed in
  emotion; write a local LCG in the test), every `styleOf` value is in `(0.5, 2)`.

`emotion.test.ts`, personality block:

- `traitsOf` composure equals `clamp(0.45 + 0.15C − 0.25N + 0.2·control, 0.1, 1.2)` and discipline
  `clamp(0.25 + 0.2C − 0.15N + 0.5·control, 0, 0.95)` for MALLORCA.
- `selfBlame = σ(1.2C + 0.8N + 0.8A − 0.6E)`, `coping = σ(−1.2N + 0.6E − 0.5A + control − 0.5)`,
  `urgency = clamp01(0.5N − 0.5C)`: assert MALLORCA's three to 1e-9; a profile with N 0.8, C −0.6 has urgency 0.7.
- With control 0 and with control 1 and Big Five at ±1 corners, coping and selfBlame stay in (0, 1).

`profiles.test.ts`: drop the tests on experience; keep the range test without experience.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/emotion` — Expected: FAIL (`natureOf` not exported, `coping` undefined).

- [ ] **Step 3: Implement**

Remove `experience` from `Personality` and every profile. `styleFrom` computes
`2 ** Math.tanh(Math.atanh(STYLE_SHARE) * nature + push)` per axis. `natureOf` divides each axis sum by the sum of
absolute coefficients. Follow the compile errors: `debugView` drops `experience` and computes `baseline` from
`styleOf(bigFive)`; the debug panel drops the experience slider and its copy; `profileBots` drops `experience` from
`HABITS` and its style bot plays `styleOf(p.bigFive)` through `toBotBias`; the lab drops its experience row and slider.
Update `profileBots.test.ts:54` to assert the extreme style bot's aggression is `> 1.7` and `< 2` (the clamp is gone).

- [ ] **Step 4: Run the checks** — `npx tsc --noEmit && npx vitest run src/emotion tools/arena src/game` — PASS.

- [ ] **Step 5: Commit** — `feat(emotion): personality without experience, stances and a natural style in tanh`

---

### Task 2: Impulses rise in log space; the approach of each emotion

**Files:**

- Modify: `src/emotion/emotions.ts`
- Test: `src/emotion/emotion.test.ts` (emotions block)

**Interfaces:**

- Produces: `APPROACH: Readonly<Record<Emotion, number>>` with the spec's table (hope −0.1, fear −0.43, joy 0.1,
  distress −0.5, relief 0.4, disappointment −0.4, pride 0.3, shame −0.6, anger 0.6, injustice 0.4, surprise −0.1).
- Produces: `ATTACK_S = 0.5`; `type Pending = Readonly<Partial<Record<Emotion, number>>>` (each value is
  `−ln(1 − amount)` still to land); `queue(p: Pending, emotion: Emotion, amount: number): Pending`;
  `rise(e: Emotions, p: Pending, dt: number): { emotions: Emotions; pending: Pending }`.

- [ ] **Step 1: Failing tests**
- Queue 0.42 of joy and `rise` in 40 steps of 0.05 s: joy ends within 1e-6 of `addImpulse(noEmotions(), 'joy', 0.42)`.
- After 0.5 s joy is `1 − e^(−L/2)` with `L = −ln 0.58` (≈ 0.2385, ±1e-3): half of the log mass has landed.
- Queuing 1.0 does not produce Infinity or NaN; the emotion reaches ≥ 0.999 after 10 s.
- `APPROACH` equals `EMOTION_PAD[e][2]` for every emotion except anger and injustice.

- [ ] **Step 2: Run** `npx vitest run src/emotion -t emotions` — FAIL.
- [ ] **Step 3: Implement** in `emotions.ts`; clamp amounts to 0.999999 before the log.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(emotion): impulses rise over half a second, and every emotion has an approach`

---

### Task 3: Tension inside a hand

**Files:**

- Create: `src/emotion/tension.ts`
- Modify: `src/emotion/appraisal.ts` (remove `prospectTargets`; `stakesOf` and `FUTURE_RISK` go in Task 4), `src/emotion/engine.ts`
- Test: `src/emotion/tension.test.ts`, `src/emotion/emotion.test.ts` (engine block)

**Interfaces:**

- Consumes: `Traits.coping`, `Traits.gains` (Task 1).
- Produces: `STAKE_BB = 20` (moved here, re-exported by `appraisal.ts`), `EQUITY_LEANING = 0.5`, `RELEASE_S = 1.5`,
  `atStakeOf(p: Prospect): number`, `leaningOf(coping: number, equity: number): number`,
  `tensionTargets(p: Prospect, traits: Traits): { hope: number; fear: number }`.

- [ ] **Step 1: Failing tests** (`tension.test.ts`), with stack 100:
- `atStakeOf` of a limped flop (pot 2, two streets, equity 0.5) is 1; of a flopped straight (pot 6, equity 0.86, two
  streets) is `3 + 0.5 · 12 · 0.72` = 7.32; of a river pot of 70 at any equity is 35.
- `leaningOf(0.5, 0.5)` is 0.5; `leaningOf(0.26, 0.86)` is `σ(logit 0.26 + 0.5 · logit 0.86)` (≈ 0.47); equity 0 and 1
  give finite values in (0, 1).
- Tension of equity 0 or 1 is 0 (both targets 0).
- For MALLORCA's traits with coping overridden: coping 0.18 on a coin flip in a pot of 120 gives fear > 0.8 and hope
  < 0.15; coping 0.75 gives hope > fear.
- The limped coin flip gives both targets < 0.06 for every profile in `PERSONALITIES`.

Engine block in `emotion.test.ts`:

- Replace "clears hope and fear when the hand ends": after a result, hope and fear are still > 0 at 0.5 s and < 0.01
  at 10 s.

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `tension.ts` per the spec's formulas (clamp equity to [0.01, 0.99] inside the logit). In the
      engine, track toward `tensionTargets` with hope up 0.8 s and fear up 0.25 s while a hand runs; with no prospect both
      go to 0 with `RELEASE_S`. Remove `settle`; the result keeps `sessionNetBb` and clears the prospect only.
- [ ] **Step 4: Run** `npm test` — PASS. The event appraisal is still the old one until Task 4; update only the
      assertions about hope and fear targets (`emotion.test.ts` "raises hope with equity…" and "counts what can still be
      won…" are replaced by the `tension.test.ts` cases).
- [ ] **Step 5: Commit** — `feat(emotion): tension inside a hand, felt by her coping`

---

### Task 4: Appraisal on general axes

**Files:**

- Modify: `src/emotion/appraisal.ts` (events to axes)
- Create: `src/emotion/feelings.ts` (axes to impulses)
- Modify: `src/emotion/engine.ts` (queue impulses, rise in `step`)
- Test: `src/emotion/appraisal.test.ts` (new, moves the appraisal and own-move blocks out of `emotion.test.ts`),
  `src/emotion/emotion.test.ts`, `src/persona/perception.test.ts`, `src/persona/persona.test.ts`,
  `src/conversation/speaking.test.ts`, `src/game/sessionPersona.test.ts`

**Interfaces:**

- Consumes: `tension.ts`, `queue`/`rise` (Task 2), `Traits.selfBlame`, `Traits.coping`.
- Produces: `interface Appraisal { value; realized; resolved; self; opponent; luck; expected; unexpected; control;
reason: string }`; `appraisalOf(e: TableEvent, ctx: AppraisalContext): Appraisal | null` with
  `AppraisalContext { prospect: Prospect | null; pressure: number; traits: Traits }`;
  `impulsesOf(a: Appraisal, now: Emotions, traits: Traits): Impulse[]` (gain applied, amounts ≤ 1, reason from
  `a.reason`, entries ≤ 0.005 dropped); `appraise(e, now, traits, ctx)` = both, as the engine's single entry.

- [ ] **Step 1: Failing tests** (`appraisal.test.ts`), one per formula of the spec, each on a constructed `Traits`:
- Bad beat (result −100 at last equity 0.91): luck = `smoothstep(0.5, 0.95, 0.91)`; injustice ≈ `m · luck · 0.91`;
  with coping 0.75 distress < injustice; with coping 0.18 distress > injustice.
- Loss to a raise at last equity 0.35, selfBlame 0.1 and coping 0.75: anger > shame and disappointment < 0.15;
  selfBlame 0.89 and coping 0.18: shame > anger and disappointment > anger.
- Win at last equity 0.2: surprise > 0.4 and pride < joy · 0.5 (the cards' share is high).
- `opponentBet` of 20 bb: the threat at equity 0.5 is twice the threat at 0.1 and at 0.9 (bet part only, no raise).
- Raise with pressure 3: the raise part is `0.12 · 2.5`.
- Street with unchanged equity returns no impulses; a change of 0.05 gives a joy > 0 below 0.05 (no threshold).
- Fold of a hand at equity 0.7 facing 20 bb: anger for coping 0.75, distress for coping 0.18; the fold relieves the
  fear she holds (`relief = fear · 1`).
- `ownMove` bet: equity 0.3, amount 20 bb gives fear (prospective, self); equity 0.85 gives pride. This keeps today's
  reactions until the bluff task.
- `chat` values: tease −0.25, mockBluff −0.35, compliment +0.25, friendly +0.1, claimStrength −0.12 prospective,
  claimWeakness +0.1 prospective.

Then run the existing suites outside emotion and update only the assertions that encode the old special cases, each
to the general rule: `perception.test.ts:125-129` (disappointment after a street drop now needs `expected · (1 −
coping)`), `speaking.test.ts:183-184` and `sessionPersona.test.ts:40-41` (assert the bad beat raises injustice and
reach, and moves Mallorca's bias, without a fixed direction for tightness).

- [ ] **Step 2: Run** `npx vitest run src/emotion src/persona src/conversation src/game` — FAIL.
- [ ] **Step 3: Implement.** `appraisal.ts` maps each `TableEvent` kind to axes per the spec's list. `feelings.ts` holds
      the spec's "Axes to emotions" block verbatim and nothing else. The engine queues impulses (`queue`) and lands them in
      `step` (`rise`); `event` still returns the impulses for the journal and the face pulses.
- [ ] **Step 4: Run** the same command — PASS; `npm test` — PASS.
- [ ] **Step 5: Commit** — `feat(emotion): appraise every event on the same axes`

---

### Task 5: Approach in the mood

**Files:**

- Modify: `src/emotion/mood.ts`, `src/emotion/engine.ts`
- Test: `src/emotion/emotion.test.ts` (mood and engine blocks)

**Interfaces:**

- Produces: `stepApproach(approach: number, e: Emotions, dt: number, config: MoodConfig): number`, rest 0, same
  rules as the PAD step (toward the weighted centre of emotions ≥ 0.05 at `intensity / changeTimeS`, back to 0 at
  `√3 / returnTimeS` without emotions). `Snapshot.approach: number`.

- [ ] **Step 1: Failing tests**
- Steady anger 0.8 for 600 s raises approach above 0.2; steady shame lowers it below −0.2.
- Without emotions, approach 0.5 returns to 0 within `returnTimeS / √3 · 0.5` s and never overshoots.
- `setPersonality` keeps `approach`, `pressure`, emotions and pending impulses (snapshot before and after equal apart
  from `traits`, `bias` and `load`).

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(emotion): her mood remembers whether she leans in or pulls back`

---

### Task 6: The style from her state

**Files:**

- Create: `src/emotion/play.ts`
- Delete: `src/emotion/bias.ts`, `src/emotion/load.ts`
- Modify: `src/emotion/engine.ts`, `src/emotion/index.ts`, `src/persona/index.ts`, `src/face/frame.ts`,
  `src/game/debugView.ts`, `src/game/index.ts`, `src/ui/debug/StateSection.tsx`, `src/ui/debug/BiasSection.tsx`,
  `src/ui/debug/PersonalitySection.tsx`, `src/ui/debug/copy.ts`, `prototypes/emotion-lab/main.ts`,
  `prototypes/emotion-lab/report.ts`, `prototypes/emotion-lab/ui/labels.ts`
- Test: `src/emotion/play.test.ts`, `src/emotion/sessions.test.ts`, `src/face/face.test.ts`,
  `src/game/debugView.test.ts`, `src/ui/debug/EmotionDebug.test.tsx`

**Interfaces:**

- Consumes: `APPROACH` (Task 2), `Snapshot.approach` (Task 5), `styleFrom`, `Traits.nature`, `Traits.urgency`.
- Produces: `MOOD_WEIGHT = 2`, `PUSH_GAIN = 2`, `URGENCY_PUSH = 0.8`, `PLAY_AXES: Record<BiasKey, Pad>` (the spec's
  table, columns P, A, approach); `affectOf(e: Emotions, moodShift: Pad, approach: number, urgency: number): Pad`;
  `partsOf(e: Emotions, moodShift: Pad, approach: number): [Emotion | 'mood', number][]` (the length of each
  emotion's contribution, and of the mood's); `playOf(affect: Pad, traits: Traits): PlayReading` with
  `PlayReading { intensity; overload; reach; bias: PlayBias }`.
- Produces: `Snapshot.load: { intensity; overload; reach; composure; discipline; parts }`, `Snapshot.affect: Pad`;
  `Snapshot.drivers`, `LOAD_SOURCES`, `LoadSource`, `biasOf`, `driversOf`, `loadOf`, `desperationOf` removed.

- [ ] **Step 1: Failing tests**

`play.test.ts`:

- An empty state gives intensity 0, reach 0, overload 0 and `bias` equal to `traits.baseline` (Review Focus).
- `overload = I² / (I² + composure²)` and `reach = (1 − discipline) · overload` at I = composure is half of
  `(1 − discipline)`.
- Anger 0.8 raises aggression above the baseline for the brash profile; fear 0.8 lowers it for the anxious one.
- Urgency: for the same anger, the impulsive profile's approach exceeds the conscientious one's by
  `0.8 · urgency · A`.
- Fuzz: 500 random emotion vectors and moods (local LCG) on every profile keep every bias value in (0.5, 2), no NaN.

`sessions.test.ts`, the spec's reference shape, with the scripted session and heater written as event lists in the
test (calm hands, bad beat 100 bb at 91%, four losses of 12 bb to raises, cooler 40 bb, sixteen quiet hands; heater
as in the spec), stepping 0.25 s:

- At rest the order of aggression is rita > sol > ingrid > mallorca > vera > mira > greta > nina.
- After the losses: rita's aggression is above her rest, nina's, vera's and greta's below theirs; ingrid moves by
  less than 0.05 on every axis.
- Five minutes of quiet hands bring mallorca within 0.05 of her rest on every axis.
- The heater raises every profile's aggression above its rest.
- Every value at every step is strictly inside (0.5, 2).

Readers:

- `face.test.ts`: `nervousOf` grows with negative `approach` (a snapshot with approach −0.5 and no fear is nervous
  > 0.1) and is ≈ 0 when calm.
- `debugView.test.ts`: the load block lists `parts` ordered by `EMOTIONS` then `'mood'`, and shows `intensity`,
  `reach`, `overload`, `composure`; the personality block shows `selfBlame`, `coping`, `urgency`; no `experience`.
- `EmotionDebug.test.tsx`: the strain block renders "Intensity", "Composure", "Reaches the play" and the mood block
  "Approach".

- [ ] **Step 2: Run** `npx vitest run src/emotion src/face src/game src/ui` — FAIL.
- [ ] **Step 3: Implement.** `play.ts` per the spec's section 4; the engine's `snapshot()` builds `affect`, `load` and
      `bias` from it. `nervousOf = clamp01(0.7 fear + 0.4 shame + 0.3 max(0, −approach))`. The debug panel's copy: "Strain"
      block rows "Intensity", "Composure", "Overload", "Reaches the play", then the parts with emotion labels and "mood";
      "Approach" under the mood map; the bias block shows "Nature at rest", "Now" and "Sent to the bot". The lab shows the
      same numbers where it showed load and drivers.
- [ ] **Step 4: Run** `npx tsc --noEmit && npm test` — PASS.
- [ ] **Step 5: Commit** — `feat(emotion): her play style is a projection of how she feels`

---

### Task 7: Nine characters

**Files:**

- Modify: `src/emotion/profiles.ts`, `src/game/characters.ts`, `src/locales/en.json`, `src/ui/debug/copy.ts`
- Test: `src/emotion/profiles.test.ts`, `src/ui/StartScreen.test.tsx`

**Interfaces:**

- Produces: `PERSONALITIES` keys in order `mallorca, ingrid, mira, nina, lola, sol, rita, vera, greta, neutral` with the
  spec's table; `CHARACTERS` = the first nine.

- [ ] **Step 1: Failing tests**
- `Object.keys(PERSONALITIES)` equals the list above; `CHARACTERS` equals it without `neutral`.
- Each character key has `start.characters.<key>.{name,line,hard,hello}` in `en.json`; none contains `—`, `–` or a
  word of two or more capital letters.
- The start screen renders nine character buttons with `data-testid="character-<key>"`.

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** with the spec's Big Five, control, suppression and copy (Mallorca's line "Warm and
      curious. Opens up when the cards are kind.", label "A fair fight"). Debug labels for the new keys and "Neutral".
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** — `feat(ui): nine characters at the table`

---

### Task 8: Docs, arena and the full check

**Files:**

- Modify: `docs/emotion/README.md`, `ARCHITECTURE.md` (emotion, persona, face sections and the debug view list),
  `docs/emotion/generated.md` (via `npm run lab:report`), `tools/arena/README.md` (style bots)

- [ ] **Step 1:** Rewrite the README sections on appraisal, hope and fear, load and bias to the spec's model, with
      the reference table; update ARCHITECTURE.md's emotion contract (Snapshot fields, `play.ts`, no experience).
- [ ] **Step 2:** `npm run lab:report`, then check `git diff docs/emotion/generated.md` shows the new profiles.
- [ ] **Step 3:** Full check: `npm run lint && npx tsc --noEmit && npm test && npm run test:golden && npm run build &&
E2E_PORT=4810 npm run test:e2e` — all PASS.
- [ ] **Step 4:** `CONTACT_PORT=4811 npm run contact`; open `e2e/contact/phone.png` and `e2e/contact/desktop.png` once
      each and check the start screen shows nine characters without overflow.
- [ ] **Step 5:** Arena smoke: `npm run arena -- --a persona:rita --b persona:nina --pairs 200` runs and prints bb/100.
- [ ] **Step 6: Commit** — `docs: the general emotion play model in the README and the architecture`
