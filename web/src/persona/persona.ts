import type { Rng } from '../cards/index.ts';
import { MALLORCA, maskOf } from '../emotion/index.ts';
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
import { classOf, strengthOf } from './strength.ts';
import type { StrengthClass } from './strength.ts';
import { botBiasOf, speakFactorOf, wordsOf } from './view.ts';

export type Stance = 'bluff' | 'hide';

export interface Presenting {
  stance: Stance;
  shows: StrengthClass;
  effort: number;
}

export const PRESENTING_EFFORT: Readonly<Record<Stance, number>> = { bluff: 0.6, hide: 0.5 };

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
  presenting: Presenting | null;
  mask: number;
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
    const presenting = this.presenting();
    const effort = presenting?.effort ?? 0;
    return {
      personality: this.personality,
      snapshot,
      hand: this.hand,
      stance: presenting?.stance ?? null,
      presenting,
      mask: maskOf(snapshot.traits.mask, effort, snapshot.load.overload),
      bias: botBiasOf(snapshot),
      words: wordsOf(snapshot),
      speakFactor: speakFactorOf(snapshot),
    };
  }

  strength(): StrengthClass {
    const { her, board } = this.hand;
    return her === null ? UNKNOWN_STRENGTH : classOf(this.feeling.perceived(), board.length);
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

  private presenting(): Presenting | null {
    if (this.hand.ended || this.hand.her === null) {
      return null;
    }
    if (this.bluffKey === this.streetKey()) {
      return { stance: 'bluff', shows: 'strong', effort: PRESENTING_EFFORT.bluff };
    }
    if (this.strength() !== 'strong') {
      return null;
    }
    return { stance: 'hide', shows: 'weak', effort: PRESENTING_EFFORT.hide };
  }

  private streetKey(): string {
    return `${this.hand.handNumber}:${this.hand.street}`;
  }
}

export function createPersona(options: PersonaOptions): Persona {
  return new TablePersona(options);
}
