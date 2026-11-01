import { mulberry32 } from '../cards/index.ts';
import type { Rng } from '../cards/index.ts';
import type { Impulse, Personality, Snapshot } from '../emotion/index.ts';
import type { EngineEvent, SeatIndex } from '../engine/index.ts';
import { createPersona } from '../persona/index.ts';
import type { Bias, JournalEntry, Signal, Stance } from '../persona/index.ts';
import { createConversation } from './conversation.ts';
import type { HandFacts, LineIntent } from './conversation.ts';
import type { Habits } from './habits.ts';
import type { Character, FeelingState } from './state.ts';
import type { SessionSummary } from './summary.ts';

export interface SpeakerOptions {
  seat: SeatIndex;
  rng: Rng;
  habits?: Habits;
}

export interface Speaker {
  observe(events: readonly EngineEvent[], nowMs: number): LineIntent | null;
  hear(signals: readonly Signal[]): void;
  playerRange(weights: ArrayLike<number>, handNumber: number): void;
  replyIntent(): LineIntent;
  facts(): HandFacts;
  moodWords(): string[];
  feeling(): Snapshot;
  feelingAt(nowMs: number): Snapshot;
  impulses(): Impulse[];
  stance(): Stance | null;
  feelingFor(intent: LineIntent): FeelingState;
  character(): Character;
  setPersonality(p: Personality): void;
  resetFeeling(): void;
  journal(): (JournalEntry & { spoke: boolean })[];
  bias(): Bias;
  summary(): SessionSummary;
  mask(): number;
}

const SEED_RANGE = 0x100000000;

export function createSpeaker(options: SpeakerOptions): Speaker {
  const own = mulberry32(Math.floor(options.rng.next() * SEED_RANGE));
  const persona = createPersona({ seat: options.seat, rng: own });
  const conversation = createConversation(options);
  const spoke = new Set<number>();
  let now = 0;
  let cursor = 0;
  const view = () => persona.view(now);
  return {
    observe(events, nowMs) {
      now = Math.max(now, nowMs);
      const from = persona.lastJournalId();
      const intent = conversation.observe(persona.observe(events, nowMs), persona, nowMs);
      if (intent !== null) persona.journalSince(from).forEach((e) => spoke.add(e.id));
      return intent;
    },
    hear(signals) {
      persona.hear(signals);
      conversation.heard(signals);
    },
    playerRange: (weights, handNumber) => persona.narrow(weights, handNumber),
    replyIntent: () => conversation.replyIntent(persona, now),
    facts: () => conversation.facts(view()),
    moodWords: () => conversation.moodWords(view()),
    feeling: () => view().snapshot,
    feelingAt: (nowMs) => persona.view(nowMs).snapshot,
    impulses() {
      const fresh = persona.journalSince(cursor);
      cursor = persona.lastJournalId();
      return fresh.flatMap((e) => e.impulses);
    },
    stance: () => view().stance,
    feelingFor: (intent) => conversation.feelingFor(intent, view()),
    character: () => conversation.character(view()),
    setPersonality: (p) => persona.setPersonality(p),
    resetFeeling() {
      persona.reset();
      spoke.clear();
    },
    journal: () => persona.journal().map((e) => ({ ...e, spoke: spoke.has(e.id) })),
    bias: () => view().bias,
    summary: () => conversation.summary(),
    mask: () => view().mask,
  };
}
