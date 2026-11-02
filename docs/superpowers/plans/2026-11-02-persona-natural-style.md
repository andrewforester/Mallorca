# Her natural style, stage 4: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fill `Traits.baseline` with a natural style from the Big Five pulled to the blueprint by experience, add
`control` for self-control, and measure styled and feeling bots in arena sessions.

**Architecture:** a pure `emotion/style.ts` computes the style; `traitsOf` uses it and reads `control`. The arena
gains sessions (one bot instance for K hands, mirrored on the same decks) and two bot families, `style:` (constant
baseline bias) and `persona:` (a persona drives the cfr bot's bias on a model clock).

**Tech Stack:** TypeScript, Vitest, Preact (debug panel), Node worker threads (arena).

**Spec:** `docs/superpowers/specs/2026-11-02-persona-natural-style-design.md`

## Global Constraints

- No comments in code; ESLint limits (400 lines a file, 60 a function, depth 3, complexity 12, 4 parameters, no
  import cycles).
- TDD: failing test first. Never weaken a test.
- Before every commit: `npm run lint`, `npx tsc --noEmit`, `npm test` from `web/`.
- Atomic conventional commits with the layer as scope; `git branch --show-current` is `persona-natural-style`.
- UI copy: no all-caps words, no dashes as sentence punctuation.
- Arena runs under `taskpolicy -b`.

## Review Focus

1. A `persona:` bot in a mirrored session sits in the other seat: its persona must be created with that seat.
2. `--session 1` must reproduce today's results exactly (same decks, seeds, hand numbers, button 0).
3. `arena:paired` over session runs must pair by session, not by hand, or its interval is too narrow.
4. Overrides with an unknown field or a value outside [0, 1] for `experience`, `control`, `suppression` (outside
   [-1, 1] for traits) must be rejected as an unknown bot name.
5. The debug panel personality editor must carry `control` through, or editing a slider resets it to undefined.

---

### Task 1: style and control in emotion

**Files:** create `src/emotion/style.ts`; modify `src/emotion/personality.ts`, `src/emotion/profiles.ts`,
`src/emotion/index.ts`, every `Personality` literal in tests (`face.test.ts`, `state.test.ts`, `emotion.test.ts`);
test `src/emotion/style.test.ts`, `src/emotion/profiles.test.ts`.

**Interfaces:**

- Produces: `Personality.control: number`; `STYLE_COEFFICIENTS: Readonly<Record<BiasKey, Readonly<BigFive>>>`;
  `styleOf(bigFive: BigFive, experience: number): PlayBias`; both exported from `emotion/index.ts`.

- [ ] Tests in `style.test.ts`: neutral Big Five gives 1 on every axis at experience 0 and 0.5; any profile at
      experience 1 gives 1; a single trait 1 at experience 0 gives `exp(coefficient)` per axis; profile table of the
      spec to 2 decimals (`mallorca` 1.01 1.04 1.00 1.00 1.05, `lola` 1.17 1.49 1.09 1.02 1.47, `nina` 0.67 0.96 0.65
      0.79 1.25, `ingrid` 0.99 0.96 1.00 1.01 0.96, `mira` 1.01 1.02 1.01 1.00 1.03).
- [ ] Tests in `profiles.test.ts`: every profile has `control === experience`; discipline follows `control` (raising
      `experience` alone leaves discipline unchanged); composure rises with both; `traitsOf(p).baseline` equals
      `styleOf(p.bigFive, p.experience)`; discipline and composure of each profile equal the old formulas.
- [ ] Run, see them fail; implement with the coefficient table and formulas of the spec; run, pass.
- [ ] Commit `feat(emotion): her natural style from character, pulled to the blueprint by experience`.

### Task 2: fixture

- [ ] `npx vitest run src/game/sessionPayloads.test.ts` fails on bias; re-record the fixture the way its test
      file documents; commit `test(game): record the session payloads again for her natural style` with the reason
      in the body.

### Task 3: debug panel and lab

**Files:** `src/game/debugView.ts` (`control`, `baseline: [BiasKey, number][]`), `src/ui/debug/PersonalitySection.tsx`
(slider "Self-control"), `src/ui/debug/BiasSection.tsx` (a "Natural style" block of bars over `view.baseline`),
`src/ui/debug/copy.ts`; `prototypes/emotion-lab/ui/panels.ts` (slider), `prototypes/emotion-lab/report.ts` (row).

- [ ] Tests: `debugView.test.ts` exposes `control` and `baseline`; `EmotionDebug.test.tsx` renders the slider and
      the style block; editing another slider keeps `control`.
- [ ] Implement, pass, run `npm run lab:report` to refresh `docs/emotion/generated.md`; commit
      `feat(ui): her self-control and natural style in the debug panel`.

### Task 4: arena sessions

**Files:** `tools/arena/match.ts`, `run.ts`, `worker.ts`, `stats.ts`, `cli.ts`, `paired.ts`, `pairedCli.ts`; tests
next to them.

**Interfaces:**

- Produces: `BotFactory = (rng: Rng, seat: SeatIndex) => ArenaBot`; `ArenaBot.events?(events: readonly
EngineEvent[]): void`; `playPair(a, b, seed, index, session = 1)`; `summarize(nets, bigBlind, handsPerPair = 2)`;
  `ArenaOptions.session`; `Report.session`; `netsOfRecords(records, session = 1)`.

Hand `j` of session `k` of pair `index`: deck index `index·K + j` (deck rng as today with it), button `j % 2`, hand
number `(index·K + j)·2 + k + 1`, bots made once per session with today's rng formula `seed ^ (index·4 + k·2 + seat)`.

- [ ] Tests: `--session 1` gives the same net and events as before for a fixed seed (compare against the current
      `playPair` output captured in the test); a session of 3 makes each bot once and plays 3 hands; the mirrored
      session plays the same decks with seats swapped; `events` receives every step; `summarize` with
      `handsPerPair` 400 reports hands and bb/100 per hand; `netsOfRecords` with session 3 sums by session pair; CLI
      rejects `--session 0`.
- [ ] Implement; `styleOfA` takes the seat of A as `floor(i / K) % 2`; `writeHands` names hands the same way; the
      run name and report carry the session length when above 1.
- [ ] Commit `feat(arena): sessions of hands with one bot instance, mirrored on the same decks`.

### Task 5: style and persona bots

**Files:** create `tools/arena/cfrModels.ts` (model cache and `cfrBrainOf(key, rng): CfrBrain`, moved from
`bots.ts`), `tools/arena/profileBots.ts` (names), `tools/arena/personaBot.ts`; modify `bots.ts`,
`src/persona/view.ts` (export `toBotBias(b: PlayBias): Bias`); tests.

**Interfaces:**

- Produces: `profileOfName(name): { kind: 'style' | 'persona'; personality: Personality; label: string } | null`;
  `createPersonaBot(brain: CfrBrain, personality: Personality, seat: SeatIndex, rng: Rng): ArenaBot`.

Persona bot: `events` advances its clock (+8000 ms on `handStarted`, +6000 ms on `acted`), calls
`persona.observe(events, now)`, and after an `acted` event by the other seat that is not followed by `handEnded`
calls `persona.narrow(brain.opponentRange(), handNumber)`; `decide` sets `brain.setBias(persona.view(now).bias)`
first. The match loop calls `observe` for observations before `events`.

- [ ] Tests: names `style:lola`, `persona:nina@experience=0.9,control=0.1` parse and label (`style-lola`,
      `persona-nina-experience0.9-control0.1`); unknown profile, field or out-of-range value is not a bot name; a
      `style:` bot's bias equals `toBotBias(traitsOf(p).baseline)`; a persona bot's bias after a sequence of lost
      big pots differs from its bias at the start; its persona is created at the seat given.
- [ ] Implement; commit `feat(arena): style and persona bots of the personality profiles`.

### Task 6: runs and calibration

- [ ] Measure: `persona:lola` vs `cfr`, `--pairs 10 --session 200`, wall time; estimate 200 pairs.
- [ ] Runs of the spec, seed 5, `--pairs 200 --session 200`, `taskpolicy -b`, `--stats` for bot A where it is a
      profile. Hot strong `persona:lola@experience=0.9,control=0.1`, cold weak
      `persona:ingrid@experience=0.2,control=0.9`. Exploiter runs with the same seed; `arena:paired --session 200`.
- [ ] Check the calibration targets of the spec; if Lola's style is not visible by 5 points, raise the scale of the
      coefficients (one common factor) and repeat; record what was changed.
- [ ] Results and the new bots into `tools/arena/README.md`; commit `docs(arena): natural style and persona runs`.

### Task 7: documentation

- [ ] `docs/emotion/README.md` and `ARCHITECTURE.md` per the spec; commit `docs: her natural style and self-control`.

### Task 8: cleanup

Six commits, each test first where behaviour changes: `PersonaView.stance`; mask from the persona view in
`faceFrame`; hide effort 0.5 for `acting: 'weak'` in `talkCases.ts`; unused `Feeling` methods; a caught river bluff
is not also a mistake (test: one shame impulse); unused `ownMove` fields.

### Task 9: checks and pull request

- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run test:golden`, `npm run build`,
      `E2E_PORT=4810 npm run test:e2e`, `CONTACT_PORT=4811 npm run contact` and look at both sheets.
- [ ] Push, open the pull request, do not merge.
