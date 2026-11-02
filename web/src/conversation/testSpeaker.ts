import { mulberry32 } from '../cards/index.ts';
import type { Rng } from '../cards/index.ts';
import type { Impulse, Personality, Snapshot } from '../emotion/index.ts';
import type { EngineEvent, SeatIndex } from '../engine/index.ts';
import { createPersona } from '../persona/index.ts';
import type { Bias, JournalEntry, PersonaView, Signal, Stance } from '../persona/index.ts';
import { createPlanner } from './planner.ts';
import type { Planned } from './planner.ts';
import type { Rule } from './rules.ts';
import type { SessionSummary } from './summary.ts';

export interface SpeakerOptions {
  seat: SeatIndex;
  rng: Rng;
  rules?: readonly Rule[];
}

export interface Speaker {
  observe(events: readonly EngineEvent[], nowMs: number): Planned;
  reply(text?: string): Planned;
  hear(signals: readonly Signal[]): void;
  playerRange(weights: ArrayLike<number>, handNumber: number): void;
  view(): PersonaView;
  moodWords(): string[];
  feeling(): Snapshot;
  feelingAt(nowMs: number): Snapshot;
  impulses(): Impulse[];
  stance(): Stance | null;
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
  const planner = createPlanner(options);
  const spoke = new Set<number>();
  let now = 0;
  let cursor = 0;
  const view = () => persona.view(now);
  return {
    observe(events, nowMs) {
      now = Math.max(now, nowMs);
      const planned = planner.observe(persona.observe(events, nowMs), persona, nowMs);
      const spoken = planned.verdicts.find((v) => v.speak);
      spoken?.occasion.journalIds.forEach((id) => spoke.add(id));
      return planned;
    },
    reply: (text = 'hi') => planner.reply(text, persona, now),
    hear(signals) {
      persona.hear(signals);
      planner.heard(signals);
    },
    playerRange: (weights, handNumber) => persona.narrow(weights, handNumber),
    view,
    moodWords: () => view().words,
    feeling: () => view().snapshot,
    feelingAt: (nowMs) => persona.view(nowMs).snapshot,
    impulses() {
      const fresh = persona.journalSince(cursor);
      cursor = persona.lastJournalId();
      return fresh.flatMap((e) => e.impulses);
    },
    stance: () => view().stance,
    setPersonality: (p) => persona.setPersonality(p),
    resetFeeling() {
      persona.reset();
      spoke.clear();
    },
    journal: () => persona.journal().map((e) => ({ ...e, spoke: spoke.has(e.id) })),
    bias: () => view().bias,
    summary: () => planner.summary(),
    mask: () => view().mask,
  };
}
