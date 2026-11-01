# Persona as the core, stage 1

The opponent should play like a real person at a home game: who she is (her personality) shapes what she feels, and
what she feels shapes how she plays, what she says, her face and her voice. Her emotional state is the one source of
truth for all of them, and the table, including her own moves, is what changes it.

The emotion model already works this way as formulas (`src/emotion`), but the live state of the model is owned by the
talk layer: `Talk` holds a `Feeling` that holds the `Engine`. The face reaches her feeling through `talk.active()`,
`game` takes `PERSONALITIES` from a re-export of `talk`, and a `Talk` is created against the math bot only so the face
has a feeling. This stage moves the live opponent into a layer of her own and renames what the code calls things,
without changing how she plays, speaks or looks.

## Roadmap

1. **This spec.** The `persona` layer owns her perception of the hand and her emotions; `talk` becomes
   `conversation` and only reads her; the play `style` becomes `bias`, already split as `baseline × emotional` with a
   neutral baseline. No behaviour change.
2. One perception of her hand (the strength class from her equity against the player's range) and one decision of
   what she presents (bluff, hide strength, nothing) for the face, the line hint and the voice. The tells setting
   (`obvious`, `subtle`, `hidden`) goes: how readable she is comes from her personality.
3. Her own moves as appraisal events, the `mistake` event included.
4. The baseline bias from personality and experience: her natural manner (tight, loose, aggressive, passive) from her
   traits, held closer to the blueprint by experience, measured in the arena.
5. The full personality profile: Big Five, suppression, experience, face look, voice and speech habits in one value.

## Terms

- **Personality**: who she is, fixed data. Today the `Personality` of `emotion` (Big Five, `suppression`,
  `experience`); stage 5 adds the look, the voice and the speech habits.
- **Persona**: one personality alive at the table for one session. It sees the hand from her seat, holds the emotion
  engine with its state (emotions, mood, load, pressure, session result), knows what she acts (`stance`) and gives the
  outputs every other part reads.
- **Bias**: the five multipliers that tilt the blueprint's action probabilities at one decision (`aggression`,
  `looseness`, `bluff`, `sizing`, `stickiness`; the bot reads `tightness = 1 / looseness`). All ones play the
  blueprint as it is. Today it is called the play style; "style" in poker is a player's lasting manner, and this is a
  momentary tilt, so it is renamed. `bias = clamp(baseline × emotional, 0.5, 2)`: the baseline is her natural manner
  (all ones in this stage, filled in stage 4) and the emotional part is today's `1 + leakage × Σ coefficient ×
  driver`.

## Layers

```
web/src/
  emotion/       the model: formulas, no state of a session, imports nothing (unchanged role)
  persona/       her at the table: perception of the hand, the engine, the journal, stance and bias
  conversation/  her speech: when to speak, the line intent, the server contract, the session summary
  face/          her face and voice as numbers (unchanged)
```

| Layer          | May import from                                                                 |
| -------------- | ------------------------------------------------------------------------------- |
| `persona`      | `cards`, `equity`, `emotion`, types from `engine`                               |
| `conversation` | `cards`, `emotion`, types from `engine`, types from `persona`                   |
| `face`         | `emotion`                                                                       |
| `game`         | `cards`, `equity`, `engine`, `brains`, `cfr`, `persona`, `conversation`, `coach`, `face` |

`conversation` takes only types from `persona`, enforced by the ESLint rule of its directory, so speech can read her
and never change her. `persona` and `conversation` stay pure under the rules of "Purity". `tools/arena` and
`prototypes/emotion-lab` import from `persona` and `conversation` in place of `talk`.

### What moves where

| Today                                                                 | After                                        |
| --------------------------------------------------------------------- | -------------------------------------------- |
| `talk/handTracker.ts` (`HandState`, `track`, `netOf`, …)              | `persona/hand.ts`                            |
| `talk/feeling.ts` (equity, money, the `TableEvent`s, the engine)      | `persona/perception.ts`                      |
| `talk/range.ts`, `talk/strength.ts`                                   | `persona/`                                   |
| `talk/journal.ts`                                                     | `persona/journal.ts`, entries with an `id`   |
| `talk/signals.ts` (`Signal`, `SIGNALS`)                               | `persona/signals.ts`: what she hears         |
| `talk/style.ts` (`Style`, `NEUTRAL_STYLE`)                            | `persona/bias.ts` (`Bias`, `NEUTRAL_BIAS`)   |
| `stance()`, the strength cache and `bluffKey` of `talk/talk.ts`       | `persona/`                                   |
| `wordsOf`, `speakFactor` of `talk/feeling.ts`                         | `persona/`: how she names her state, her urge to speak |
| habits, pace, `LineIntent`, `drawLine`, facts, summary, `state.ts`    | `conversation/`                              |

## Persona

```ts
interface PersonaOptions {
  seat: SeatIndex;
  rng: Rng;
  personality?: Personality;
}

interface Moment {
  event: EngineEvent;
  before: HandState;
  after: HandState;
  strength: StrengthClass | null;
  playerBluffShown: boolean;
}

interface PersonaView {
  personality: Personality;
  snapshot: Snapshot;
  hand: HandState;
  stance: Stance | null;
  bias: Bias;
  words: string[];
  speakFactor: number;
}

interface PersonaReader {
  view(nowMs: number): PersonaView;
  strength(): StrengthClass;
  journal(): JournalEntry[];
  journalSince(id: number): JournalEntry[];
  lastJournalId(): number;
}

interface Persona extends PersonaReader {
  observe(events: readonly EngineEvent[], nowMs: number): Moment[];
  narrow(weights: ArrayLike<number>, handNumber: number): void;
  hear(signals: readonly Signal[]): void;
  setPersonality(p: Personality): void;
  reset(): void;
}

function createPersona(options: PersonaOptions): Persona;
```

- `observe` advances the engine to `nowMs`, then for each event tracks the hand, appraises it (today's
  `feeling.see`) and returns one `Moment` per event. `strength` is her strength class at that event when she sized up
  her hand there, else null; `playerBluffShown` is true on the `handEnded` of a hand where the player bet the river
  and showed a weak hand. The moments are how speech learns what she perceived, event by event, without a second hand
  tracker.
- `view(nowMs)` reads her at `nowMs` without moving the engine (the engine's `ahead`); a `nowMs` at or before the
  last `observe` reads the current state. `bias` is the bot's `Bias` of `snapshot.bias`, `words` today's `wordsOf`,
  `speakFactor` today's `speakFactor`.
- `strength()` is her strength class on the current board, computed once per board and cached, as `Talk` does today
  for `replyIntent`.
- `narrow` and `hear` are today's `Talk.playerRange` and `Talk.hear` on her side: the range of another hand, after the
  hand ended or after the player showed is ignored.
- `setPersonality` and `reset` are today's `setPersonality` and `resetFeeling`; `reset` empties the journal.

### One timeline

The persona is the only holder of her time. Every reader asks `view(now)`: the bias sent with `decide` and recorded
with the decision, the face every 100 ms, the voice prosody when a line arrives, and the feeling sent with a line or a
reply. Today the bias is read from the last `observe`, which the session always runs with `now()` just before a
decision, so this changes no decision; it makes the rule explicit.

### The journal is the impulse stream

`JournalEntry` is `{ id, handNumber, event, impulses, words }`, one per `TableEvent` she appraised (`chat` included),
`id` increasing from 1 for the life of the persona, the newest 50 kept (`JOURNAL_SIZE`). `journal()` lists them newest
first, as today; `journalSince(id)` lists the entries after `id`, oldest first. Every consumer keeps its own cursor,
so the face, a later voice and the debug panel never take impulses from one another. This replaces `Talk.impulses()`,
which drained one shared queue.

The `spoke` flag of today's entries is speech, not her: the debug probe in `game` keeps the ids of the entries made by
an `observe` whose `conversation.observe` returned an intent, and `DebugState.journal` marks them.

## Conversation

`createConversation({ seat, rng, level, habits? })` returns a `Conversation`, today's `Talk` without her feeling:

- `observe(moments, persona: PersonaReader, nowMs)` returns a `LineIntent` or null: the situation of each moment as
  today, the pace (one unprompted line per street, none in the 1.5 s after a line), `drawLine` with
  `persona.view(nowMs).speakFactor`, the bluff and hand-end situations from the moments.
- `replyIntent(persona)`, `facts(view)` (from `view.hand`), `feelingFor(intent, view)` (`feelingState` of
  `view.snapshot`), `moodWords(view)` and `character(view)` (`characterOf(view.personality)`) keep today's meaning
  and payloads; the session passes `persona.view(now())`.
- `heard(signals)` adds the signals to the session summary only; `summary()`, `setLevel(level)` as today.

The server contract is unchanged: the bodies of `line`, `reply` and `summary` are the same bytes for the same game.

## Game

The session makes a `Persona` and a `Conversation` on every `start`, for every opponent (the face needs her against
the math bot too). Each step, in this order:

1. `bot.observe(observations)`.
2. `moments = persona.observe(events, now())`.
3. `conversation.observe(moments, persona, now())`; an intent requests a line as today.
4. `face.observe(events)` reads `persona.journalSince(cursor)` for its pulses and the events for the gaze; switching
   the face on moves its cursor to `lastJournalId()`, so it shows no old reaction.
5. Against a Solver, after a player action that does not end the hand, `bot.opponentRange()` then
   `persona.narrow(weights, handNumber)`, dropped unless the epoch, the persona and the request are still current.

A reply's signals and a quick phrase's signals go to `persona.hear` and `conversation.heard` from `game`. The bias of a
decision is `persona.view(now()).bias` for a Solver opponent and none for the math bot, as today.

### Determinism

The session keeps one `mulberry32(seed ^ 0x7a1c)` for speech. As in today's `Talk` constructor, its first draw seeds
the persona's own generator (`mulberry32(floor(next() × 2³²))`), which every equity sample and strength class uses.
The persona computes her strength class at the same events and in the same order as `Talk` does today (her check,
call or raise, a raise of the player, the hand end, and `strength()` for a reply), so a seeded session plays, speaks
and records exactly as before.

## Renames

### `talk` to `conversation`, in `web/`

The layer and its types (`Talk` to `Conversation`, `createTalk` to `createConversation`, `TalkOptions`), `game`'s
`sessionTalk.ts` (`sessionConversation.ts`), `SessionState.talk` (`conversation`), `setTalk`, `attachTalk`,
`connectTalk`, `talkOn`, `TalkState`, `TalkView`, `TalkClient`, `TalkReply`, `talkClient.ts`, `remoteTalk.ts`,
`talkLoader.ts` (`loadTalkClient`, `talkConnector`, `TalkConfig`), the `ui` components and props, the tests, the
locale keys under `talk` and the sections of `ARCHITECTURE.md`.

Kept, because they live outside the code or in users' browsers: the Edge Function `talk` and its URL, the tables
`talk_lines`, `memories` and `usage`, `supabase/functions/talk/eval`, `talk-ci.yml`, and the preference key
`mallorca.talk` in `localStorage`.

### `style` to `bias`, everywhere in code

`emotion` (`PlayStyle` to `PlayBias`, `STYLE_KEYS` to `BIAS_KEYS`, `styleOf` to `biasOf`, `STYLE_RANGE`,
`Snapshot.style` to `Snapshot.bias`; the unused `cfrStyleOf` goes), `brains` (`BotStyle` to `BotBias`,
`Brain.setStyle` to `setBias`, `Breakdown.styled` to `biased`), `cfr`, the worker protocol, `BotClient.decide`,
`game` (`sentStyle` and `engineStyle` of the debug state and view), the debug panel, `solver/crates/core`
(`bot::style` to `bot::bias`, `Style` to `Bias`, `styled` to `biased`) and the wasm ABI (`bot_style` to `bot_bias`,
pinned by `abi.test.ts`), `docs/emotion/README.md` ("Стиль игры" to "Перекос игры").

`biasOf(drivers, leakage, baseline)` returns `clamp(baseline[k] × (1 + leakage × Σ coefficient × driver), 0.5, 2)` per
key; `Traits.baseline` is a `PlayBias` of ones, the seam stage 4 fills.

Kept: the `style` key of a stored hand record's decisions (`HandRecord` version 1 in IndexedDB), written and read
under that name.

## Testing

TDD: a test fails first, then the code.

- The tests of `feeling`, `handTracker`, `journal` and `strength` move to `persona/`, those of `talk` to
  `conversation/`, `sessionTalk.test.ts` to `sessionConversation.test.ts`; only imports and names change, never an
  assertion.
- New: `view(now)` moves nothing (two reads agree, the next `observe` gives what it gave without them);
  `journalSince` gives two cursors the same impulses; the face switched on again shows no old pulse; `narrow` for
  another hand or after a showdown is ignored; a reply's signals reach the persona through `game`; the bias sent with
  `decide` and recorded equals `persona.view(now).bias`; `biasOf` with a baseline multiplies it and clamps.
- Seeded session tests and `simulation.test.ts` pass with their assertions unchanged; the `line`, `reply` and
  `summary` payloads of a seeded session equal the ones before the change.
- A value import from `persona` in `conversation` fails `npm run lint`.
- Rust: `cargo fmt`, `clippy`, `test` and both wasm builds after the rename.
- Before the pull request: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run test:golden`, `npm run build`,
  `npm run test:e2e`, the contact sheets looked at once (nothing visible changes), and a short arena run, since
  `tools/arena` moves to the new imports.

## Documentation

`ARCHITECTURE.md`: the layer list and import table, a `persona` section, the `talk` section as `conversation`, the
`game` sections on table talk, face and debug, the data flow. `docs/emotion/README.md`: the status line, "Связь с
разговорным агентом" and the bias naming.
