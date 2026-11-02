# Conversation planner, stage 1, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Her talk becomes a deterministic planner in `conversation` (occasion, rules, verdict, humour, plan) and a
server that only words the plan, with a filter, a conversation debug panel and a version 2 eval.

**Architecture:** `persona` gives each `Moment` its impulses and journal ids. `conversation` turns moments into
occasions, judges them against a rules table and gates, draws a claim and a humour style, and builds an
`UtterancePlan`. `game` sends the plan (version 2) to the Edge Function `talk`, which builds a short prompt from the
plan and the Big Five, checks the answer and asks once more, and returns the attempts. Every verdict becomes a trace
entry shown in the debug panel's "Conversation" tab.

**Tech Stack:** TypeScript, Preact, Vitest (`web/`); Deno, `@anthropic-ai/sdk` (`supabase/functions/talk`).

**Spec:** `docs/superpowers/specs/2026-11-02-conversation-planner-design.md`

## Global Constraints

- Node: `source ~/.nvm/nvm.sh && nvm use` in `web/` before any npm command.
- Before every commit in `web/`: `npm run lint`, `npx tsc --noEmit`, `npm test`. Before every commit in
  `supabase/functions`: `deno fmt --check`, `deno lint`, `deno test --permit-no-files` (run in `supabase/functions`).
- TDD: the failing test first, then the code. Never weaken a test, delete an assertion, loosen a tolerance or add an
  `eslint-disable`, ignore or baseline.
- No comments in code or config.
- ESLint on every non-test file in `web/src`: at most 400 lines per file (blank lines and comments not counted), 60
  lines per function, nesting depth 3, cyclomatic complexity 12, 4 parameters, no import cycles.
- Layers (`ARCHITECTURE.md`): `conversation` may import `cards`, `emotion`, types from `engine` and types from
  `persona` only; `ui` imports only from `game`.
- UI copy: no all-caps words, no em or en dashes as sentence punctuation.
- Atomic conventional commits with the layer as scope (`feat(conversation): ...`, `feat(talk): ...`); run
  `git branch --show-current` before committing (branch `feat/conversation-planner`). Every commit ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Every number below is the spec's; do not tune any of them in this plan.
- The eval spends money only on the owner's budget: dry runs only in this plan.

## Review Focus

1. A step whose moments hold both an action and the hand end (the player calls the river and the hand ends): the
   hand-end occasion speaks and the action is `superseded`, never two lines. Task 4.
2. A reply typed between hands (no live hand, `handNumber` of the last hand): the plan still has facts of the last
   hand, no claim, and the reply is placed. Tasks 4 and 13.
3. Her cards at a hand that ended without a showdown are never in `facts`, and the filter rejects naming them as a
   rank not on the board. Tasks 6 and 10.
4. A plan with `words.max` 1 and an answer of one word plus punctuation ("Hm.") passes the length check; "Hm, ok."
   does not. Task 10.
5. A version 1 body from an old tab after the deploy is still answered with `{ text, delivery }`. Task 11.

---

### Task 1: A moment carries its impulses and journal ids

**Files:**

- Modify: `web/src/persona/journal.ts`, `web/src/persona/persona.ts`
- Test: `web/src/persona/persona.test.ts`, `web/src/persona/journal.test.ts` (create if absent)

**Interfaces:**

- Produces: `Moment.impulses: Impulse[]`, `Moment.journalIds: number[]`; `Journal.add(felt, words): number[]`
  returns the ids it added.

- [ ] **Step 1: Write the failing tests**

In `persona.test.ts`, `describe('moments')`:

- `it('gives the river its impulses and the ids of the entries it made')`: a seeded hand to the river where her
  draw misses; the `streetDealt` moment of the river has `impulses.length > 0`, and
  `persona.journal().filter((e) => moment.journalIds.includes(e.id))` has the same impulses in the same order.
- `it('gives a moment that appraised nothing no impulses and no ids')`: the `blindPosted` moment has
  `impulses: []`, `journalIds: []`.
- `it('numbers the ids of one step in event order')`: the ids of all moments of one `observe` are increasing and
  equal `journalSince(before)` ids.

In `journal.test.ts`: `add` of two felt entries returns `[n + 1, n + 2]` where `n` was `last()`.

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run --project node src/persona`
Expected: FAIL, `impulses` and `journalIds` undefined.

- [ ] **Step 3: Implement**

`Journal.add` returns the ids. In `TablePersona.step`, after `this.feeling.see(event, this.hand)`, take
`this.feeling.takeFelt()`, add it to the log with `this.feeling.words()` and put
`impulses: felt.flatMap((f) => f.impulses)` and the returned ids on the moment. `record()` stays for `narrow` and
`hear`; `observe` no longer calls it after the events (nothing is left to take).

- [ ] **Step 4: Run `npm test`**

Expected: PASS, including `simulation.test.ts` and the seeded session tests unchanged.

- [ ] **Step 5: Commit** `feat(persona): a moment carries its impulses and journal ids`

---

### Task 2: Occasions

**Files:**

- Create: `web/src/conversation/types.ts`, `web/src/conversation/occasion.ts`
- Test: `web/src/conversation/occasion.test.ts`

**Interfaces:**

- Consumes: `Moment` (Task 1), `HandState`, `StrengthClass`, `Impulse` from `persona` (types).
- Produces, in `types.ts`:

```ts
export type Act =
  | "react"
  | "claim"
  | "press"
  | "stall"
  | "deflect"
  | "concede"
  | "complain"
  | "enjoy"
  | "tease"
  | "answer";
export const ACTS: readonly Act[];
export type OccasionKind =
  | "herBet"
  | "herCall"
  | "herFold"
  | "playerRaise"
  | "card"
  | "handEnded"
  | "playerSaid";
export type HandEnd = "bluffCaught" | "playerBluffShown" | "won" | "lost";
export interface Occasion {
  kind: OccasionKind;
  end: HandEnd | null;
  impulses: Impulse[];
  journalIds: number[];
  handNumber: number;
  street: string;
  actionStreet: string;
  strength: StrengthClass;
  endsHand: boolean;
  hand: HandState;
  text: string | null;
  previous: OccasionKind | null;
}
```

- In `occasion.ts`: `CARD_IMPULSE = 0.2`;
  `occasionsOf(moments: readonly Moment[], seat: SeatIndex, strengthNow: () => StrengthClass): Occasion[]` (oldest
  first); `replyOccasion(text: string, hand: HandState, strength: StrengthClass, previous: OccasionKind | null): Occasion`.

- [ ] **Step 1: Write the failing tests** (build hands with `engine/testDeck.ts` and a real persona, as
      `conversation.test.ts` does today)
- her raise gives `herBet`, her check or call `herCall`, her fold `herFold`, the player's raise `playerRaise`, the
  player's call nothing;
- a call that closes the flop: `actionStreet: 'flop'`, `street: 'turn'`;
- the turn whose strongest impulse is 0.19 gives no `card`; at 0.2 a `card` with `street` and `actionStreet` the
  turn (build the impulses through a crafted `Moment` for the boundary);
- the hand end: lost at a showdown with a weak class after her late bet is `end: 'bluffCaught'`; the moment's
  `playerBluffShown` (and she won) is `playerBluffShown`; else `won` or `lost`; `endsHand` true only there;
- `strength` is the moment's, or `strengthNow()` when the moment has none;
- `replyOccasion('hi', hand, 'weak', 'herBet')` has `kind: 'playerSaid'`, `text: 'hi'`, `previous: 'herBet'`, no
  impulses.

- [ ] **Step 2: Run** `npx vitest run --project node src/conversation/occasion.test.ts`. Expected: FAIL (no module).
- [ ] **Step 3: Implement** `occasion.ts` (the `bluffCaught` test is today's `endHand` in `conversation.ts`).
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(conversation): occasions from her moments`

---

### Task 3: Rules and the speak chance; the arena reads it

**Files:**

- Create: `web/src/conversation/rules.ts`
- Modify: `web/tools/arena/talking.ts`, `web/src/conversation/index.ts`
- Test: `web/src/conversation/rules.test.ts`, `web/tools/arena/talking.test.ts` (create if absent)

**Interfaces:**

- Consumes: `Occasion`, `OccasionKind`, `HandEnd`, `Act` (Task 2); `Snapshot`, `Emotion`, `Stance`,
  `StrengthClass` types.
- Produces:

```ts
export type Condition =
  | { emotion: Emotion; min: number }
  | { strength: StrengthClass }
  | { presenting: Stance }
  | { overload: number }
  | { end: HandEnd };
export type Chance = number | Readonly<Record<StrengthClass, number>>;
export interface Rule {
  id: string;
  occasion: OccasionKind;
  when: readonly Condition[];
  act: Act;
  chance: Chance;
}
export const RULES: readonly Rule[];
export interface RuleContext {
  occasion: Occasion;
  snapshot: Snapshot;
  presenting: Stance | null;
}
export function matching(rules: readonly Rule[], context: RuleContext): Rule[];
export function chosen(matched: readonly Rule[]): Rule | null;
export function chanceFor(rule: Rule, strength: StrengthClass): number;
export function speakChanceOf(
  rule: Rule,
  strength: StrengthClass,
  mask: number,
): number;
export function ruleFor(id: string): Rule;
```

`RULES` is the spec's table in the spec's order, ids `herBet`, `herCall`, `herFold`, `herFold.anger`, `herFold.shame`,
`playerRaise`, `playerRaise.fear`, `card.surprise`, `card.fear`, `card.hope`, `won`, `won.relief`, `lost`,
`lost.injustice`, `lost.anger`, `lost.disappointment`, `bluffCaught`, `bluffCaught.shame`, `playerBluffShown`,
`playerSaid`. The `handEnded` rows carry `{ end }` in `when`. The spec's "anger or shame at least 0.3" row of `herFold` is two
rows, `herFold.anger` and `herFold.shame`, with the same act and chance. An emotion condition holds when
`max(the occasion's impulses of that emotion, snapshot.emotions[name]) >= min`; `overload` compares
`snapshot.load.overload`.

- [ ] **Step 1: Write the failing tests**
- `chosen` takes the rule with the most conditions, then the first: lost with injustice 0.4 and disappointment 0.4
  chooses `lost.injustice`; lost with nothing gives `lost`; a `card` occasion with no emotion at its threshold gives
  no match;
- `speakChanceOf(ruleFor('herBet'), s, 1)` is `(0.2 + 0.35 + 0.6) / 3` for all three classes;
  `speakChanceOf(ruleFor('herBet'), 'weak', 0)` is 0.6; a number chance ignores mask and class;
- `talking.test.ts`: for masks 0, 0.5, 0.9 and every class, the arena bot's chance equals
  `habitsAt(BASE_HABITS, mask).herBet[class].speak` (copy the three expected rows as literals before habits go in
  Task 7: mask 0 `{strong: 0.2, medium: 0.35, weak: 0.6}`, mask 0.5 and 0.9 computed by the same formula).

- [ ] **Step 2: Run** `npx vitest run --project node src/conversation/rules.test.ts tools/arena`. Expected: FAIL.
- [ ] **Step 3: Implement** `rules.ts`; `talking.ts` uses `speakChanceOf(ruleFor('herBet'), strength, mask)`;
      export `RULES`, `ruleFor`, `speakChanceOf` from `conversation/index.ts` (the arena imports them).
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(conversation): her rules of when to speak, read by the arena`

---

### Task 4: The verdict and the claim

**Files:**

- Create: `web/src/conversation/verdict.ts`
- Test: `web/src/conversation/verdict.test.ts`

**Interfaces:**

- Consumes: Tasks 2 and 3; `PersonaView`; `Rng`.
- Produces:

```ts
export const PACE_MS = 1500;
export const CLAIM_RATE = 0.7;
export type Silence = "noRule" | "pace" | "street" | "roll" | "superseded";
export interface Claim {
  about: StrengthClass;
  honest: boolean;
}
export interface ClaimDraw {
  rolls: number[];
  claim: Claim | null;
}
export interface ChanceParts {
  base: number;
  masked: number;
  speakFactor: number;
  final: number;
}
export interface Verdict {
  occasion: Occasion;
  matched: { id: string; act: Act; chance: number }[];
  rule: string | null;
  act: Act | null;
  chance: ChanceParts | null;
  roll: number | null;
  sinceLastMs: number | null;
  speak: boolean;
  reason: Silence | null;
  claim: ClaimDraw | null;
}
export interface Pace {
  lastLineAt: number;
  usedStreets: ReadonlySet<string>;
}
export function judge(
  occasions: readonly Occasion[],
  view: PersonaView,
  pace: Pace,
  nowMs: number,
  rng: Rng,
): Verdict[];
export const streetKey: (handNumber: number, street: string) => string;
```

`judge` returns verdicts newest first. Gates in order: `noRule`, `pace` (not for `playerSaid`), `street` (key of
`actionStreet`; not for `handEnded`, `playerSaid`), `roll` (`rng.next() >= final`, `final =
min(1, masked * view.speakFactor)`). After the first that speaks, older ones are `superseded` with no draw. The claim
is drawn only for a speaking `herBet`, `herCall`, `playerRaise`, and for `playerSaid` when `previous` is one of them or
null: `rng.next() < CLAIM_RATE`, then `rng.next() < 1 - view.mask` gives `{ about: strength, honest: true }`, else
`view.presenting?.shows` with `honest: false`, else null. A claim makes `act` `'claim'`.

- [ ] **Step 1: Write the failing tests** with a stub `Rng` returning listed numbers and a crafted `PersonaView`:
- `pace`: a line 1499 ms ago silences with `sinceLastMs: 1499`; 1500 passes;
- `street`: a used key silences `herCall`, not `handEnded`;
- `roll`: chance 0.35 times speak factor 1.2 is a final 0.42: roll 0.41 speaks, roll 0.42 is silent;
- two occasions `[herCall, handEnded]` with rolls that let both speak: the `handEnded` verdict speaks, `herCall` is
  `superseded` with `roll: null` (Review Focus 1);
- `playerSaid` speaks at 0 ms since the last line and on a used street;
- claim: mask 0 gives `honest: true` about her class; mask 1 with `presenting.shows: 'strong'` gives
  `{ about: 'strong', honest: false }`; mask 1 and no presenting gives no claim and keeps the rule's act;
  `playerSaid` with `previous: 'handEnded'` draws no claim (Review Focus 2).

- [ ] **Step 2: Run**, expect FAIL. **Step 3: Implement.** **Step 4: Run**, expect PASS.
- [ ] **Step 5: Commit** `feat(conversation): the verdict of every occasion and her claim`

---

### Task 5: Humour

**Files:**

- Create: `web/src/conversation/humour.ts`
- Test: `web/src/conversation/humour.test.ts`

**Interfaces:**

- Consumes: `Act`, `Occasion`; `BigFive`, `Snapshot`; `Rng`.
- Produces:

```ts
export type HumourStyle =
  "affiliative" | "selfEnhancing" | "aggressive" | "selfDefeating";
export const HUMOUR_STYLES: readonly HumourStyle[];
export const HUMOUR_WEIGHTS: Readonly<
  Record<HumourStyle, Readonly<Record<keyof BigFive, number>>>
>;
export const ACT_STYLES: Readonly<Record<Act, readonly HumourStyle[]>>;
export const JOKE_BASE = 0.15;
export const COOL_LINES = 3;
export interface Humour {
  style: HumourStyle;
  target: "self" | "play" | "situation";
  intensity: "soft" | "clear" | "sharp";
  softened: boolean;
}
export interface HumourDraw {
  tendency: Record<HumourStyle, number>;
  state: Record<HumourStyle, number>;
  p: number;
  roll: number;
  styleRoll: number | null;
  style: HumourStyle | null;
}
export function tendencyOf(bigFive: BigFive): Record<HumourStyle, number>;
export function stateOf(
  snapshot: Snapshot,
  bigFive: BigFive,
): Record<HumourStyle, number>;
export function jokeChance(
  bigFive: BigFive,
  snapshot: Snapshot,
  linesSinceJoke: number,
  act: Act,
): number;
export function drawHumour(
  input: {
    act: Act;
    occasion: Occasion;
    bigFive: BigFive;
    snapshot: Snapshot;
    linesSinceJoke: number;
  },
  rng: Rng,
): { draw: HumourDraw; humour: Humour | null };
```

All formulas, the weight table, the drivers, the act table and the thresholds are the spec's "Humour" section, as
written there (`P = snapshot.mood[0]`, `D = snapshot.mood[2]`, overload `snapshot.load.overload`). `cool` is 0.3 when
`linesSinceJoke < COOL_LINES`, else 1. The style draw picks by cumulative `T × S` over `ACT_STYLES[act]` in that
array's order.

- [ ] **Step 1: Write the failing tests**
- `tendencyOf` of Mallorca (`O .4, C .2, E .4, A .5, N .1`): affiliative `0.5 + 0.2 × 2 × (.46×.4 + .14×.5 + .04×.2
− .08×.1 + .26×.4)` to 1e-9, and the same formula for the other three; `A = −1, C = −0.5`, others 0: aggressive
  above affiliative; an extreme persona clamps to [0, 1];
- `stateOf`: anger 0.5 raises aggressive by `exp(0.5)` against a calm snapshot; fear 0.5 lowers it; any state stays
  in [0.3, 3];
- `jokeChance` is 0 at overload 1; with `linesSinceJoke` 2 it is 0.3 of the value at 3; `answer` halves it; calm
  Mallorca with `P = 0`: `0.15 × (1 + 0.92 × 0.4) × 1 × 1 × 1`;
- `drawHumour` with roll 0.99 gives no joke (`style: null`, `styleRoll: null`); with roll 0 and act `concede` the
  style is `selfEnhancing` or `selfDefeating` only;
- `target`: `self` for both self styles, `play` for aggressive, `play` for affiliative on `playerRaise` and
  `situation` on `card`; `intensity` at `v` 0.59 `soft`, 0.6 `clear`, 1.2 `sharp`; `softened` for aggressive at
  A 0.01 true, at A 0 false, and false for every other style.

- [ ] **Step 2: Run**, FAIL. **Step 3: Implement.** **Step 4: Run**, PASS.
- [ ] **Step 5: Commit** `feat(conversation): her humour style from her personality and her mood`

---

### Task 6: The summary's notable hands and the plan

**Files:**

- Modify: `web/src/conversation/summary.ts`
- Create: `web/src/conversation/plan.ts`, `web/src/conversation/facts.ts`
- Test: `web/src/conversation/summary.test.ts`, `web/src/conversation/plan.test.ts`, `web/src/conversation/facts.test.ts`

**Interfaces:**

- Consumes: Tasks 2 to 5.
- Produces, `summary.ts`:

```ts
export const NOTABLE_POT_BB = 20;
export const FOUGHT_BETS = 4;
export type NotableKind = 'bigWin' | 'bigLoss' | 'bluffCaught' | 'fought';
export interface Notable { kind: NotableKind; handNumber: number; potBb: number; won: boolean; bets: number }
export interface HandSummary { handNumber: number; netBb: number; potBb: number; won: boolean; bluffCaught: boolean; bets: number; reraised: boolean; playerBluffShown: boolean; playerAllIn: boolean }
SessionSummary gains notable: Notable[];
```

`withHand` keeps one `Notable` per kind: the biggest won pot of `NOTABLE_POT_BB` or more, the biggest lost, the last
caught bluff, and the most fought (`bets >= FOUGHT_BETS || reraised`; more `bets` wins, then the bigger pot).
`since` leaves `notable` as the current list.

- `facts.ts`:

```ts
export interface PublicFacts {
  street: string;
  board: Card[];
  potBb: number;
  stacksBb: { her: number; player: number };
  actions: string[];
  card: Card | null;
  result: { won: boolean; potBb: number } | null;
  shown: { her: [Card, Card]; player: [Card, Card] } | null;
}
export function publicFacts(occasion: Occasion, seat: SeatIndex): PublicFacts;
export function occasionText(occasion: Occasion, facts: PublicFacts): string;
```

`shown` only when `occasion.hand.showdown` is set. `occasionText` is one English sentence from public facts only,
one template per kind and end (for example `the player raised on the turn`, `the river came Ah`, `you lost a 38 bb
pot`, `the player showed a bluff`, `the player said something`).

- `plan.ts`:

```ts
export const HEARD_MIN = 0.15;
export const ACT_WORDS: Readonly<Record<Act, { min: number; max: number }>>;
export interface Voice {
  emotion: Emotion | "calm";
  intensity: number;
}
export interface SessionLine {
  hands: number;
  netBb: number;
  playerBluffsShown: number;
  playerAllIns: number;
  notable: Notable[];
}
export interface UtterancePlan {
  version: 2;
  act: Act;
  occasion: string;
  voice: Voice;
  words: { min: number; max: number };
  humour: Humour | null;
  claim: Claim | null;
  facts: PublicFacts;
  heard: string | null;
  session: SessionLine;
  handNumber: number;
  street: string;
  actionStreet: string;
  endsHand: boolean;
}
export function voiceOf(view: PersonaView, occasion: Occasion): Voice;
export function wordsFor(
  act: Act,
  extraversion: number,
  overload: number,
): { min: number; max: number };
export function planOf(input: {
  verdict: Verdict;
  view: PersonaView;
  humour: Humour | null;
  session: SessionLine;
  seat: SeatIndex;
}): UtterancePlan;
```

`ACT_WORDS` and the formulas of `voice` and `words` are the spec's.

- [ ] **Step 1: Write the failing tests**
- summary: a won 25 bb pot is `bigWin`, a won 19 bb pot is not; a hand of 4 bets is `fought`, a hand of 3 bets with
  a reraise is `fought`, 3 bets without one is not; of two fought hands of 5 bets the bigger pot stays;
- facts: a live hand has no `shown` and no her cards anywhere in the object (`JSON.stringify` holds neither card);
  a hand that ended without a showdown has no `shown` (Review Focus 3); after a showdown `shown.her` and
  `shown.player` are the shown cards; `potBb` and `stacksBb` divide by the big blind; `card` is the dealt card of a
  `card` occasion;
- voice: mask 1 and no presenting is `calm` at 0; mask 1 with a bluff is `pride` at `0.5`; mask 0.5 with fear 0.4 in
  the occasion's impulses and joy 0.5 in the snapshot: the occasion's fear at `0.2` wins over joy's `0.25` (the
  occasion's emotion goes first when it is heard at 0.15 or more); fear 0.28 at mask 0.5 (heard 0.14) loses to joy;
- words: `react` at E 0 is `{1, 3}` (`round(3 × 1) = 3`); `answer` at E 1 is `{3, 15}`; `tease` at overload 0.6 is
  `{3, 4}`; `react` at overload 0.6 keeps `max(min, ...)`;
- `planOf` copies `claim` from the verdict, `heard` from a `playerSaid` occasion, and the staleness fields.

- [ ] **Step 2: Run**, FAIL. **Step 3: Implement.** **Step 4: Run**, PASS.
- [ ] **Step 5: Commit** `feat(conversation): the plan of her line and the notable hands of the session`

---

### Task 7: The planner

**Files:**

- Create: `web/src/conversation/planner.ts`
- Modify: `web/src/conversation/index.ts`, `web/src/conversation/testSpeaker.ts`
- Test: `web/src/conversation/planner.test.ts`

Today's `conversation.ts`, `habits.ts` and `state.ts` stay until Task 13 switches `game` (and Task 15 the lab), so
every commit compiles.

**Interfaces:**

- Produces:

```ts
export interface Planned {
  verdicts: Verdict[];
  plan: UtterancePlan | null;
  humour: HumourDraw | null;
}
export interface Planner {
  observe(
    moments: readonly Moment[],
    persona: PersonaReader,
    nowMs: number,
  ): Planned;
  reply(text: string, persona: PersonaReader, nowMs: number): Planned;
  heard(signals: readonly Signal[]): void;
  summary(): SessionSummary;
}
export interface PlannerOptions {
  seat: SeatIndex;
  rng: Rng;
  rules?: readonly Rule[];
}
export function createPlanner(options: PlannerOptions): Planner;
```

The planner keeps the pace (`lastLineAt`, used street keys cleared at `handStarted`), the last hand occasion kind of
the hand (for `previous`), `linesSinceJoke` (counts every plan; 0 after a plan with humour; starts at `COOL_LINES`),
the bets and reraise of the hand (from `acted` raises per street), and the summary (`withHand` at `handEnded`). A
speaking verdict draws humour, then builds the plan, then marks the pace (the occasion's `actionStreet` key and the
view street's key, as today). `reply` always returns a plan. `index.ts` exports `createPlanner` and the types `game`,
the arena and the lab use.

- [ ] **Step 1: Write the failing tests**, ported from today's `conversation.test.ts` where they still hold (her raise
      speaks with an always-speaking rules list; one unprompted line per street; none within 1.5 s; the hand end updates
      the summary with `notable`), plus: a seeded session observed twice gives deep-equal `Planned` lists; a speaking
      verdict gives a plan whose `act` is the rule's or `claim`; the plan after a joke has `humour.p` 0.3 of the plan
      before it at the same state; `reply` between hands returns a plan with `claim: null`. `testSpeaker.ts` builds a
      planner with a given rules list (every rule's chance 1) next to today's speaker.
- [ ] **Step 2: Run** `npx vitest run --project node src/conversation/planner.test.ts`, FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** `npm test`, `npm run lint`, `npx tsc --noEmit`, PASS.
- [ ] **Step 5: Commit** `feat(conversation): the planner of her lines`

---

### Task 8: Server: the version 2 request

**Files:**

- Create: `supabase/functions/talk/planTypes.ts`
- Modify: `supabase/functions/talk/types.ts` (dispatch on `version`)
- Test: `supabase/functions/talk/planTypes.test.ts`, `supabase/functions/talk/types.test.ts`

**Interfaces:**

- Produces: `LineRequestV2`, `ReplyRequestV2` (`kind`, `version: 2`, `sessionId`, `locale`,
  `personality: BigFive`, `plan: PlanBody`, `recent: RecentLine[]`, `debug: boolean`, and for a reply `text`,
  `quick`), `PlanBody` (the plan of Task 6 with cards as strings like `"Ah"`), `parsePlanRequest(body): LineRequestV2 | ReplyRequestV2 | null`.
  `TalkRequest` becomes `LineRequest | ReplyRequest | SummaryRequest | LineRequestV2 | ReplyRequestV2`;
  `parseRequest` sends `body.version === 2` to `parsePlanRequest`, any other `version` value except absent to null.

Limits: Big Five each in [-1, 1]; `act` one of the ten; `voice.emotion` one of the eleven or `calm`, intensity in
[0, 1]; `words.min` and `words.max` integers, `1 <= min <= max <= 20`; `humour` null or a known style, target,
intensity and boolean; `claim` null or `{ about, honest }`; `occasion` text of 1 to 200; `heard` null or text of 1
to 200; facts: street, at most 5 board cards, amounts finite and not negative, at most 30 actions of at most 80, `card`
null or a card, `result` null or `{ won, potBb }`, `shown` null or two pairs of cards; `session` counts and at most 4
notable entries; `recent` at most 8.

- [ ] **Step 1: Write the failing tests**: a full valid body parses to the same object; each limit above rejected
      once (a table of `[path, bad value]` cases); a body with `version: 3` is null; a body without `version` still
      parses as version 1 (Review Focus 5).
- [ ] **Step 2: Run** `cd supabase/functions && deno test talk/planTypes.test.ts talk/types.test.ts`. FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run**, PASS; `deno fmt --check`, `deno lint`.
- [ ] **Step 5: Commit** `feat(talk): the version 2 request carries her plan`

---

### Task 9: Server: her character in words and the prompt of a plan

**Files:**

- Create: `supabase/functions/talk/character.ts`, `supabase/functions/talk/planPrompt.ts`
- Test: `supabase/functions/talk/character.test.ts`, `supabase/functions/talk/planPrompt.test.ts`

**Interfaces:**

- Consumes: `LineRequestV2`, `ReplyRequestV2`, `PlanBody` (Task 8); `SystemBlock`, `Message`, `Prompt` (`prompt.ts`).
- Produces: `qualifierOf(x: number): "a bit" | "very" | "extremely" | null`; `characterText(bigFive: BigFive): string`;
  `planSystem(bigFive: BigFive): SystemBlock[]` (one block with `cache_control: { type: "ephemeral" }`);
  `planState(req, memories: readonly string[], reasons: readonly string[]): string`;
  `buildPlanMessages(req, memories, reasons): Prompt` with `TEXT_SCHEMA` (`{ text: string }`, required, no extra).

`qualifierOf`: `|x| < 0.2` null, `< 0.45` "a bit", `< 0.75` "very", else "extremely". `characterText` joins, in the
order extraversion, agreeableness, neuroticism, openness, conscientiousness, one sentence per kept trait:
`You are <qualifier> <pole>.` with the poles of the spec's table. The system text holds, in order, the spec's
setting, how talk sounds, the character, the rules, the four humour style definitions with the wit rule, and one line
per act. The state text holds the plan as labelled fields (`Act:`, `What happened:`, `Your voice:`, `Words: 1 to
3`, `Humour:` or `Humour: none`, `About your hand:` or nothing, `Facts:` lines, `The player said:` for an answer),
`Tonight:` from the session line, the memories, the locale, and, when `reasons` is not empty,
`Your last try was rejected: <reasons joined by "; ">. Try again.` Messages: the recent lines as today's `turns`,
then the state text as the final user turn.

- [ ] **Step 1: Write the failing tests**
- `qualifierOf(0.19)` null, `0.2` "a bit", `0.44` "a bit", `0.45` "very", `0.75` "extremely", `-0.5` "very";
- Mallorca reads exactly: `You are a bit outgoing: ... You are very warm: ... You are a bit imaginative: ... You are
a bit composed: ...` (four sentences, no neuroticism); extraversion −0.5 gives the reserved pole;
- the system text of any personality contains none of `attic`, `tea`, `winter`, `witty`, `playful wit`, `warmly
tease`;
- the state text holds `Words: 1 to 3` for that plan, names no emotion except `voice.emotion`, holds `Humour: none`
  when `humour` is null, and the rejection line only with reasons; the schema is `TEXT_SCHEMA`.

- [ ] **Step 2: Run**, FAIL. **Step 3: Implement.** **Step 4: Run**, PASS; fmt and lint.
- [ ] **Step 5: Commit** `feat(talk): her character in graded words and the prompt of a plan`

---

### Task 10: Server: the checks of an answer

**Files:**

- Create: `supabase/functions/talk/check.ts`
- Modify: `supabase/functions/talk/filter.ts` (export the pattern helpers `check.ts` needs)
- Test: `supabase/functions/talk/check.test.ts`

**Interfaces:**

- Produces: `wordCount(text: string): number` (runs of letters or digits, `\p{L}` and `\p{N}`);
  `rejections(text: string, plan: PlanBody, recent: readonly RecentLine[]): string[]`.

Reasons, in this order and wording: `longer than <max> words`; `named <token>` for a card token, suit symbol,
rank-of-suit phrase or rank word whose rank (and suit, when the text gives one) matches no public card (the board,
`card`, `shown`); `told about her hand` for a holding claim (`claimsHolding`) or a pocket phrase while `shown` is null;
`repeated a line` when the text, lowercased with punctuation and spaces collapsed, equals one of her lines in
`recent`. Ambiguous tokens (`As`, `Ah`, `Ad`) count only when written with a capital rank and no space before a noun,
as today's `namesCard`, and pass when public.

- [ ] **Step 1: Write the failing tests**
- `wordCount("Hm.")` 1; with `words.max` 1, "Hm." passes and "Hm, ok." gives `longer than 1 words` (Review Focus 4);
- board `Kd 7s 2c 9h Ah`: "That ace on the river" passes, "Nice king of hearts" gives `named king of hearts`,
  "A queen would have helped" gives `named queen` (Review Focus 3), "Kd, really?" passes, "Qs, really?" gives
  `named Qs`;
- live hand: "I had a flush" gives `told about her hand`; after a showdown with `shown` the same text passes;
- Russian: board without an ace, "туз пришёл" gives `named туз`; with an ace on the board it passes;
- `recent` with her "Ну, посмотрим." rejects "ну посмотрим" as `repeated a line`, a player's line does not.

- [ ] **Step 2: Run**, FAIL. **Step 3: Implement.** **Step 4: Run**, PASS; fmt and lint.
- [ ] **Step 5: Commit** `feat(talk): the checks of a planned line`

---

### Task 11: Server: the handler of a plan

**Files:**

- Create: `supabase/functions/talk/planHandler.ts`
- Modify: `supabase/functions/talk/handler.ts` (route version 2), `supabase/functions/talk/eval/run.ts` only if it
  imports something renamed
- Test: `supabase/functions/talk/planHandler.test.ts`, `supabase/functions/talk/handler.test.ts`

**Interfaces:**

- Consumes: Tasks 8 to 10; `Deps` and helpers of `handler.ts`.
- Produces: `ACT_FALLBACK: Record<"en" | "ru", Record<Act, string>>`;
  `writePlanned(req, user, memories, deps): Promise<{ text: string | null; attempts: Attempt[]; prompt: { system: string; state: string } }>`
  where `Attempt = { text: string; rejected: string[] }`; `handleLineV2`, `handleReplyV2` returning
  `{ text, attempts, prompt? }` (reply adds `signals`).

Two attempts at most: the first with no reasons; when `rejections` is not empty and `allowed(user, deps)` lets a
second call, the second with the first's reasons. A `line` whose attempts all fail answers `text: null`; a `reply`
answers `ACT_FALLBACK[lang][plan.act]` (`lang` is `ru` when the locale starts with `ru`, else `en`). `prompt` only
when `req.debug`. Lines are saved as today, a null text is not saved. Version 1 bodies keep today's path untouched.
The fallback lines are short and plain, one per act per language, for example `react`: "Hm." / "Хм.", `answer`:
"Let's play." / "Давай играть.".

- [ ] **Step 1: Write the failing tests** with a stub `complete` returning listed texts:
- a first answer within the plan returns it with one attempt and no `prompt`;
- a first answer of 6 words for `max` 4, then one of 2: two attempts, the first with `["longer than 4 words"]`, and
  the second call's state text holds that reason;
- two rejected answers on a `line`: `text: null`, nothing saved; on a `reply` with locale `ru-RU`: the Russian
  fallback of the act;
- `debug: true` adds `prompt.system` and `prompt.state`;
- a version 1 body answers `{ text, delivery }` as before (Review Focus 5); over the limit answers 429 for both
  versions.

- [ ] **Step 2: Run**, FAIL. **Step 3: Implement.** **Step 4: Run** all `deno test`, PASS; fmt and lint.
- [ ] **Step 5: Commit** `feat(talk): the function words her plan, checks it and asks once more`

---

### Task 12: Game: the version 2 client

**Files:**

- Modify: `web/src/game/conversationClient.ts`, `web/src/game/remoteConversation.ts`, `web/e2e/conversationServer.ts`
- Test: `web/src/game/conversationClient.test.ts`, `web/src/game/remoteConversation.test.ts` (create if absent)

**Interfaces:**

- Consumes: `UtterancePlan`, `SessionSummary` (Tasks 6, 7).
- Produces:

```ts
export interface Attempt { text: string; rejected: string[] }
export interface PromptEcho { system: string; state: string }
export interface LineAnswer { text: string | null; attempts: Attempt[]; prompt: PromptEcho | null }
export interface ReplyAnswer extends LineAnswer { signals: Signal[] }
export interface PlanInput { sessionId: string; locale: string; personality: BigFive; plan: UtterancePlan; recent: ChatTurn[]; debug: boolean }
export function toPlanLinePayload(input: PlanInput): PlanLinePayload;
export function toPlanReplyPayload(input: PlanInput & { text: string; quick?: boolean }): PlanReplyPayload;
ConversationClient.planLine(request: PlanLinePayload): Promise<LineAnswer | null>;
ConversationClient.planReply(request: PlanReplyPayload): Promise<ReplyAnswer | null>;
```

The version 1 `line`, `reply` and their payloads stay until Task 13 stops using them, so this task compiles alone.

The payload is the version 2 body of Task 8 (cards through `formatCard`, `version: 2`); `toSummaryPayload` sends only
today's summary fields (no `notable`) so the summary body stays the same bytes. `remoteConversation` parses
`{ text, attempts, prompt }` (a missing `attempts` is `[]`, a missing `prompt` null); a reply without a string text is
null as today. The e2e stub answers version 2 bodies with `{ text, attempts: [{ text, rejected: [] }] }`.

- [ ] **Step 1: Write the failing tests**: a plan with a live hand gives a body whose JSON holds `"version":2` and
      none of her hidden cards; the summary payload of a session with notable hands equals today's fields only;
      `remoteConversation` turns `{ text: null, attempts: [...] }` into a `LineAnswer` with `text: null`.
- [ ] **Step 2: Run**, FAIL. **Step 3: Implement.** **Step 4: Run** `npm test`, PASS.
- [ ] **Step 5: Commit** `feat(game): the version 2 client of her talk`

---

### Task 13: Game: placing lines and the trace

**Files:**

- Create: `web/src/game/conversationTrace.ts`
- Modify: `web/src/game/sessionConversation.ts`, `web/src/game/debug.ts`, `web/src/game/session.ts`,
  `web/src/game/sessionWiring.ts`, `web/src/game/index.ts`
- Modify (fixture, its own commit): `web/src/game/fixtures/sessionPayloads.json`
- Delete: `web/src/conversation/conversation.ts`, `conversation.test.ts`, `habits.ts`, `habits.test.ts` and the
  version 1 `line`, `reply`, `toLinePayload`, `toReplyPayload` of `conversationClient.ts` and `remoteConversation.ts`
  (the planner replaces them; the arena reads `speakChanceOf` since Task 3)
- Test: `web/src/game/sessionConversation.test.ts`, `web/src/game/conversationTrace.test.ts`,
  `web/src/game/debug.test.ts`, `web/src/game/sessionPayloads.test.ts`

**Interfaces:**

- Consumes: Tasks 7 and 12; `SessionConversation` holds a `Planner` in place of today's `Conversation`.
- Produces:

```ts
export type Fate = 'shown' | 'stale' | 'filtered' | 'error' | 'noClient' | 'off' | 'silent' | 'pending';
export interface TraceEntry {
  id: number; atMs: number; verdict: Verdict; plan: UtterancePlan | null; humour: HumourDraw | null;
  request: { sentAtMs: number; prompt: PromptEcho | null } | null;
  answer: { atMs: number; attempts: Attempt[]; text: string | null } | null;
  fate: Fate;
}
export interface TraceTotals { occasions: number; lines: number; silences: Partial<Record<Silence, number>>; meanWords: number; rejections: Record<string, number> }
export interface ConversationTrace { entries: TraceEntry[]; totals: TraceTotals }
export const TRACE_SIZE = 50;
export function createTrace(): { add(planned: Planned, nowMs: number): number[]; sent(id: number, atMs: number): void; answered(id: number, answer: LineAnswer | null, atMs: number, fate: Fate): void; fate(id: number, fate: Fate): void; read(): ConversationTrace };
DebugState gains conversation: ConversationTrace;
```

`SessionConversation` keeps a trace only when the session has a probe (pass `trace?: TraceSink` in
`ConversationSetup`; `session.ts` wires it under `import.meta.env.DEV && options.debug === true`, as the probe). A
silent verdict is `silent` at once; a plan without a client is `noClient`; with the conversation off `off`; on send
`pending`, then `shown`, `stale` (not current by today's `current` rule, now on `plan.handNumber`, `plan.street`,
`plan.endsHand`), `filtered` (`text: null`) or `error` (`null` answer). `debug: true` is sent in the payload only with
a trace. A reply's player line is placed as today; her answer with `text` is placed; `undelivered` marks a null
answer as today. The probe's `observed(from, spoke)` reads `spoke` from the trace entries' `verdict.occasion.journalIds`
of spoken plans; `DebugState.conversation` is refreshed on every trace change.

- [ ] **Step 1: Write the failing tests**
- trace: 51 adds keep 50, newest first; totals count silences by reason and filter rejections by reason; `meanWords`
  counts only `shown` lines;
- session: a seeded game with a stub client: a silent verdict is traced as `silent`; a shown line as `shown` with
  its attempts; a late answer after the street changed as `stale` and not placed; a `{ text: null }` answer as
  `filtered`; no client as `noClient` while the plan is still there;
- a reply typed between hands is placed (Review Focus 2);
- without the debug option the session has no trace and the payload has no `debug`;
- `debug.test.ts`: a journal entry is `spoke` when a shown plan's occasion holds its id.
- [ ] **Step 2: Run**, FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` except the payload fixture test, PASS.
- [ ] **Step 5: Commit** `feat(game): her planned lines are placed and traced`
- [ ] **Step 6: Re-record the payload fixture** of `sessionPayloads.test.ts` with the test's recording path, check by
      eye that the bodies are version 2 and carry no hidden card, run `npm test`, and commit alone:
      `test(game): record the version 2 payloads; her lines change on purpose with the planner`

---

### Task 14: UI: the conversation tab of the debug panel

**Files:**

- Create: `web/src/ui/debug/ConversationDebug.tsx`, `web/src/ui/debug/TraceEntry.tsx`,
  `web/src/ui/debug/conversationCopy.ts`
- Modify: `web/src/ui/debug/EmotionDebug.tsx` (tabs), `web/src/ui/debug/JournalSection.tsx` (link),
  `web/src/ui/debug/debug.css`, `web/src/game/debugView.ts` (pass `conversation` through)
- Test: `web/src/ui/debug/ConversationDebug.test.tsx`, `web/src/ui/debug/EmotionDebug.test.tsx`

**Interfaces:**

- Consumes: `DebugView.conversation: ConversationTrace` (Task 13 through `toDebugView`).
- Produces: tabs `Feelings` and `Conversation` (`role="tablist"`, the chosen tab kept in `localStorage` key
  `mallorca.debugTab` with try/catch like `mallorca.debugPanel`); the conversation tab shows the totals, then one
  `TraceEntry` per entry with the spec's lines (occasion head, impulses, matched rules with the chosen one marked,
  gates with numbers, then the reason of silence or the plan, humour draw, request time, a `<details>` with the prompt,
  attempts with their rejections, latency and fate); `Copy trace` writes `JSON.stringify(trace, null, 2)` through
  `navigator.clipboard.writeText`; a journal entry links to its trace entry by `#trace-<id>` and back.

- [ ] **Step 1: Write the failing tests** (`@testing-library/preact`, as `EmotionDebug.test.tsx`): the tabs switch;
      a silent entry shows `Silent: roll 0.47 over 0.31`; a shown entry shows its act, voice, words, two attempts and
      `longer than 4 words`; the copy button calls `writeText` with the JSON; the journal entry links to `#trace-<id>`.
- [ ] **Step 2: Run** `npx vitest run --project ui src/ui/debug`, FAIL. **Step 3: Implement.** **Step 4: Run**, PASS.
- [ ] **Step 5: e2e**: a test in `web/e2e` that the production preview has no `emotion-debug-toggle` (if one exists
      already, extend it to the conversation tab's test id `conversation-debug`); run `npm run test:e2e`.
- [ ] **Step 6: Look** with `npm run contact:debug` at the debug sheet once; check the tab at phone width.
- [ ] **Step 7: Commit** `feat(ui): the conversation tab of the debug panel`

---

### Task 15: Eval and its cases on version 2

**Files:**

- Delete: `web/src/conversation/state.ts`, `state.test.ts` (the lab was their last user)
- Modify: `web/prototypes/emotion-lab/talkCases.ts`, `supabase/functions/talk/eval/run.ts`,
  `supabase/functions/talk/eval/grade.ts`, `supabase/functions/talk/eval/summary.ts`,
  `supabase/functions/talk/eval/README.md`, `supabase/functions/talk/eval/cases.json`, `cases.md`
- Test: `supabase/functions/talk/eval/grade.test.ts`

**Interfaces:**

- Consumes: the planner (Task 7) in the lab builder; `handle` (Task 11) in `run.ts`.
- Produces: cases as version 2 bodies (52: the 12 sandbox scenes plus calm, for Mallorca, Ingrid, Lola and Nina, the
  plan built by `conversation` from the scene's persona with an always-speaking rules list); the judge schema gains
  `act` (one of the ten), `humour` (one of the four or `none`); `grade.ts` scores the emotion and act confusion
  matrices, the humour confusion matrix, jokes without `humour`, the share within `words.max`, repeats over
  `--repeat 5`, card leaks; the InCharacter run (`--character 20`: 20 lines per preset, the judge rates each Big Five
  trait in [-1, 1], the report gives the correlation with the given traits); pairwise runs
  (`--pair baseline,v2`, `--pair v2,v2-examples`, `--pair haiku,sonnet`) with a judge choosing the more natural and
  fitting line. `v2-examples` adds five example lines per act to the system block behind an eval-only flag of
  `buildPlanMessages`.

- [ ] **Step 1: Write the failing tests** in `grade.test.ts`: the confusion matrix of three graded lines; the
      within-budget share; a repeat counted once per identical normalized text; the character correlation of a perfect
      judge is 1.
- [ ] **Step 2: Run** `cd supabase/functions/talk/eval && deno test`, FAIL. **Step 3: Implement**; rebuild the cases
      with `npm run lab:talk-cases` in `web/`.
- [ ] **Step 4: Dry runs**: `deno run -A run.ts --variant dry --dry oracle` scores about 1 and `--dry null` about 0.
      No paid run: report the cost estimate of one full run (cases × calls × tokens from the dry traces) to the owner.
- [ ] **Step 5: Commit** `feat(talk): the eval measures planned lines, humour and character`

---

### Task 16: Documentation

**Files:**

- Modify: `ARCHITECTURE.md` (sections `persona`, `conversation`, `Table talk server`, the data flow lines `line` and
  `reply`, `game` debug; the import table is unchanged)
- Create: `docs/conversation/README.md` (Russian): the pipeline, occasions, the rules table, the gates, the claim, the
  plan formulas, the humour model with its correlation table and drivers, the character text with the poles, the
  filter, the debug panel, the eval, every number with its label, the sources of the spec's Grounding table and
  humour section with their DOIs.
- Modify: `docs/emotion/README.md` ("Связь с разговорным агентом": a pointer to the new document; "Что не готово":
  the prompt line goes).

- [ ] **Step 1: Write**, **Step 2:** `npm run lint` (prettier covers the markdown), **Step 3: Commit**
      `docs: her conversation as a planner, the humour model and the server's version 2`

---

### Task 17: Verification before the pull request

- [ ] `cd web && npm run lint && npx tsc --noEmit && npm test && npm run test:golden && npm run build && npm run test:e2e`
      (choose free ports with `E2E_PORT` if another worktree runs e2e). Expected: all pass.
- [ ] `cd supabase/functions && deno fmt --check && deno lint && deno test --permit-no-files`. Expected: pass.
- [ ] `npm run contact`, look at `web/e2e/contact/phone.png` and `desktop.png` once each (nothing visible changes in
      production).
- [ ] Short arena run with `taskpolicy -b`: `npm run arena -- --a reader --b cfr-talk-obvious --pairs 2000 --seed 1`;
      the result within the interval of the README's `reader` vs `cfr-talk-obvious` row.
- [ ] Pull request with the repository template; the description says the deploy order: the function first
      (`supabase functions deploy talk`, owner), then the web. Version 1 removal is a later pull request.
