import type { Rng } from '../cards/index.ts';
import { MALLORCA } from '../emotion/index.ts';
import type { Personality, Snapshot } from '../emotion/index.ts';
import type { EngineEvent, SeatIndex } from '../engine/index.ts';
import type { Bias } from './bias.ts';
import { NO_HAND, playerCardsShown, track } from './hand.ts';
import type { HandState } from './hand.ts';
import { Journal } from './journal.ts';
import type { JournalEntry } from './journal.ts';
import { createFeeling } from './perception.ts';
import type { Feeling } from './perception.ts';
import type { Signal } from './signals.ts';
import { strengthOf } from './strength.ts';
import type { StrengthClass } from './strength.ts';
import { botBiasOf, speakFactorOf, wordsOf } from './view.ts';

export type Stance = 'bluff' | 'hide';

export interface PersonaOptions {
  seat: SeatIndex;
  rng: Rng;
  personality?: Personality;
}

export interface Moment {
  event: EngineEvent;
  before: HandState;
  after: HandState;
  strength: StrengthClass | null;
  playerBluffShown: boolean;
}

export interface PersonaView {
  personality: Personality;
  snapshot: Snapshot;
  hand: HandState;
  stance: Stance | null;
  bias: Bias;
  words: string[];
  speakFactor: number;
}

export interface PersonaReader {
  view(nowMs: number): PersonaView;
  strength(): StrengthClass;
  journal(): JournalEntry[];
  journalSince(id: number): JournalEntry[];
  lastJournalId(): number;
}

export interface Persona extends PersonaReader {
  observe(events: readonly EngineEvent[], nowMs: number): Moment[];
  narrow(weights: ArrayLike<number>, handNumber: number): void;
  hear(signals: readonly Signal[]): void;
  setPersonality(p: Personality): void;
  reset(): void;
}

const UNKNOWN_STRENGTH: StrengthClass = 'medium';

function sizesUp(event: EngineEvent, seat: SeatIndex): boolean {
  if (event.type === 'handEnded') {
    return true;
  }
  if (event.type !== 'acted') {
    return false;
  }
  const kind = event.action.kind;
  return event.seat === seat ? kind !== 'fold' : kind === 'raise';
}

class TablePersona implements Persona {
  private readonly seat: SeatIndex;
  private readonly rng: Rng;
  private readonly feeling: Feeling;
  private readonly log = new Journal();
  private readonly strengths = new Map<number, StrengthClass>();
  private hand: HandState = NO_HAND;
  private bluffKey: string | null = null;
  private personality: Personality;

  constructor(options: PersonaOptions) {
    this.seat = options.seat;
    this.rng = options.rng;
    this.personality = options.personality ?? MALLORCA;
    this.feeling = createFeeling({ seat: this.seat, rng: this.rng, personality: this.personality });
  }

  observe(events: readonly EngineEvent[], nowMs: number): Moment[] {
    this.feeling.advance(nowMs);
    const moments = events.map((event) => this.step(event));
    this.record();
    return moments;
  }

  narrow(weights: ArrayLike<number>, handNumber: number): void {
    if (handNumber === this.hand.handNumber) {
      this.feeling.narrow(weights, this.hand);
      this.record();
    }
  }

  hear(signals: readonly Signal[]): void {
    this.feeling.hear(signals);
    this.record();
  }

  view(nowMs: number): PersonaView {
    const snapshot = this.feeling.at(nowMs);
    return {
      personality: this.personality,
      snapshot,
      hand: this.hand,
      stance: this.stance(),
      bias: botBiasOf(snapshot),
      words: wordsOf(snapshot),
      speakFactor: speakFactorOf(snapshot),
    };
  }

  strength(): StrengthClass {
    const { her, board } = this.hand;
    if (her === null) {
      return UNKNOWN_STRENGTH;
    }
    let cached = this.strengths.get(board.length);
    if (cached === undefined) {
      cached = strengthOf(her, board, this.rng);
      this.strengths.set(board.length, cached);
    }
    return cached;
  }

  journal(): JournalEntry[] {
    return this.log.list();
  }

  journalSince(id: number): JournalEntry[] {
    return this.log.since(id);
  }

  lastJournalId(): number {
    return this.log.last();
  }

  setPersonality(p: Personality): void {
    this.personality = p;
    this.feeling.setPersonality(p);
  }

  reset(): void {
    this.feeling.reset();
    this.log.clear();
  }

  private record(): void {
    this.log.add(this.feeling.takeFelt(), this.feeling.words());
  }

  private step(event: EngineEvent): Moment {
    if (event.type === 'handStarted') {
      this.strengths.clear();
    }
    const before = this.hand;
    this.hand = track(before, event, this.seat);
    this.feeling.see(event, this.hand);
    const strength = sizesUp(event, this.seat) ? this.strength() : null;
    if (event.type === 'acted' && event.seat === this.seat && event.action.kind === 'raise') {
      this.bluffKey = strength === 'weak' ? this.streetKey() : this.bluffKey;
    }
    const playerBluffShown = event.type === 'handEnded' && this.playerBluffShown();
    return { event, before, after: this.hand, strength, playerBluffShown };
  }

  private playerBluffShown(): boolean {
    const cards = playerCardsShown(this.hand, this.seat);
    if (cards === null || !this.hand.playerRiverBet) {
      return false;
    }
    return strengthOf(cards, this.hand.board, this.rng) === 'weak';
  }

  private stance(): Stance | null {
    if (this.hand.ended || this.hand.her === null) {
      return null;
    }
    if (this.bluffKey === this.streetKey()) {
      return 'bluff';
    }
    return this.knownStrength() === 'strong' ? 'hide' : null;
  }

  private knownStrength(): StrengthClass | null {
    const known = [...this.strengths.entries()].sort((a, b) => b[0] - a[0]);
    return known[0]?.[1] ?? null;
  }

  private streetKey(): string {
    return `${this.hand.handNumber}:${this.hand.street}`;
  }
}

export function createPersona(options: PersonaOptions): Persona {
  return new TablePersona(options);
}
