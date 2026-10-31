import { mulberry32 } from '../cards/index.ts';
import type { Card, Rng } from '../cards/index.ts';
import type { EngineEvent, SeatIndex } from '../engine/index.ts';
import { BASE_HABITS, habitsAt } from './habits.ts';
import type { Habit, Habits, Level, Situation } from './habits.ts';
import type { Snapshot } from '../emotion/index.ts';
import { createFeeling } from './feeling.ts';
import type { Feeling } from './feeling.ts';
import { NO_HAND, netOf, playerCardsShown, track } from './handTracker.ts';
import type { HandState } from './handTracker.ts';
import type { Signal } from './signals.ts';
import { strengthOf } from './strength.ts';
import type { StrengthClass } from './strength.ts';
import type { Style } from './style.ts';
import { EMPTY_SUMMARY, withHand, withSignals } from './summary.ts';
import type { SessionSummary } from './summary.ts';

export interface HandFacts {
  street: string;
  board: Card[];
  pot: number;
  stacks: [number, number];
  her: [Card, Card] | null;
  actions: string[];
  bigBlind: number;
}

export interface LineIntent {
  situation: Situation;
  hint: StrengthClass | null;
  honest: boolean;
  strength: StrengthClass;
  street: string;
  actionStreet: string;
  handNumber: number;
}

export interface Talk {
  observe(events: readonly EngineEvent[], nowMs: number): LineIntent | null;
  hear(signals: readonly Signal[]): void;
  playerRange(weights: ArrayLike<number>, handNumber: number): void;
  replyIntent(): LineIntent;
  facts(): HandFacts;
  moodWords(): string[];
  feeling(): Snapshot;
  style(): Style;
  summary(): SessionSummary;
  setLevel(level: Level): void;
}

export interface TalkOptions {
  seat: SeatIndex;
  rng: Rng;
  luckRng?: Rng;
  level: Level;
  habits?: Habits;
}

export interface Spot {
  habits: Habits;
  situation: Situation;
  strength: StrengthClass;
  speakFactor: number;
}

export interface Draw {
  speak: boolean;
  honest: boolean;
  hint: StrengthClass | null;
}

interface Candidate {
  situation: Situation;
  strength: StrengthClass;
  key: string;
  street: string;
}

const PACE_MS = 1500;
const SEED_RANGE = 0x100000000;
const BET_HINT_RATE = 0.7;
const UNKNOWN_STRENGTH: StrengthClass = 'medium';
const HAND_END: ReadonlySet<Situation> = new Set<Situation>(['handWon', 'handLost', 'bluffCaught']);

export const endsHand = (situation: Situation): boolean => HAND_END.has(situation);

const hintRateOf = (situation: Situation): number => (HAND_END.has(situation) ? 0 : BET_HINT_RATE);

function opposite(strength: StrengthClass, rng: Rng): StrengthClass {
  if (strength === 'strong') {
    return 'weak';
  }
  if (strength === 'weak') {
    return 'strong';
  }
  return rng.next() < 0.5 ? 'strong' : 'weak';
}

function drawHint(habit: Habit, situation: Situation, strength: StrengthClass, rng: Rng) {
  const honest = rng.next() < habit.honest;
  if (rng.next() >= hintRateOf(situation)) {
    return { honest, hint: null };
  }
  return { honest, hint: honest ? strength : opposite(strength, rng) };
}

export function drawLine(spot: Spot, rng: Rng): Draw {
  const habit = spot.habits[spot.situation][spot.strength];
  const chance = Math.min(1, habit.speak * spot.speakFactor);
  if (rng.next() >= chance) {
    return { speak: false, honest: false, hint: null };
  }
  return { speak: true, ...drawHint(habit, spot.situation, spot.strength, rng) };
}

function actedSituation(event: EngineEvent, seat: SeatIndex): Situation | null {
  if (event.type !== 'acted') {
    return null;
  }
  const kind = event.action.kind;
  if (event.seat !== seat) {
    return kind === 'raise' ? 'playerBet' : null;
  }
  if (kind === 'raise') {
    return 'herBet';
  }
  return kind === 'fold' ? null : 'herCall';
}

class TableTalk implements Talk {
  private readonly seat: SeatIndex;
  private readonly rng: Rng;
  private readonly luck: Rng;
  private readonly base: Habits;
  private habits: Habits;
  private hand: HandState = NO_HAND;
  private readonly heart: Feeling;
  private session: SessionSummary = EMPTY_SUMMARY;
  private last: Situation | null = null;
  private lastLineAt = Number.NEGATIVE_INFINITY;
  private readonly usedStreets = new Set<string>();
  private readonly strengths = new Map<number, StrengthClass>();

  constructor(options: TalkOptions) {
    this.seat = options.seat;
    this.rng = options.rng;
    this.luck = options.luckRng ?? mulberry32(Math.floor(options.rng.next() * SEED_RANGE));
    this.base = options.habits ?? BASE_HABITS;
    this.habits = habitsAt(this.base, options.level);
    this.heart = createFeeling({ seat: this.seat, rng: this.luck });
  }

  observe(events: readonly EngineEvent[], nowMs: number): LineIntent | null {
    this.heart.advance(nowMs);
    let candidate: Candidate | null = null;
    for (const event of events) {
      candidate = this.step(event) ?? candidate;
    }
    return candidate === null ? null : this.unprompted(candidate, nowMs);
  }

  hear(signals: readonly Signal[]): void {
    this.heart.hear(signals);
    this.session = withSignals(this.session, signals);
  }

  playerRange(weights: ArrayLike<number>, handNumber: number): void {
    if (handNumber === this.hand.handNumber) {
      this.heart.narrow(weights, this.hand);
    }
  }

  replyIntent(): LineIntent {
    const situation = this.last ?? 'herCall';
    const strength = this.strength();
    const habit = this.habits[situation][strength];
    const { honest, hint } = drawHint(habit, situation, strength, this.rng);
    return this.intent(
      { situation, strength, key: '', street: this.hand.street },
      {
        speak: true,
        honest,
        hint,
      },
    );
  }

  facts(): HandFacts {
    const { street, board, pot, stacks, her, actions, bigBlind } = this.hand;
    return {
      street,
      board: [...board],
      pot,
      stacks: [stacks[0], stacks[1]],
      her,
      actions: [...actions],
      bigBlind,
    };
  }

  moodWords(): string[] {
    return this.heart.words();
  }

  feeling(): Snapshot {
    return this.heart.snapshot();
  }

  style(): Style {
    return this.heart.style();
  }

  summary(): SessionSummary {
    return this.session;
  }

  setLevel(level: Level): void {
    this.habits = habitsAt(this.base, level);
  }

  private step(event: EngineEvent): Candidate | null {
    if (event.type === 'handStarted') {
      this.strengths.clear();
      this.usedStreets.clear();
      this.last = null;
    }
    const key = this.streetKey();
    const { street } = this.hand;
    this.hand = track(this.hand, event, this.seat);
    this.heart.see(event, this.hand);
    const situation =
      event.type === 'handEnded' ? this.endHand() : actedSituation(event, this.seat);
    if (situation === null) {
      return null;
    }
    this.last = situation;
    return { situation, strength: this.strength(), key, street };
  }

  private endHand(): Situation {
    const hand = this.hand;
    const strength = this.strength();
    const won = hand.awarded[this.seat] > 0;
    const bluffCaught = !won && hand.showdown !== null && strength === 'weak' && hand.herLateBet;
    const netBb = netOf(hand, this.seat);
    this.session = withHand(this.session, {
      netBb,
      playerBluffShown: this.playerBluffShown(),
      playerAllIn: hand.playerAllIn,
    });
    if (bluffCaught) {
      return 'bluffCaught';
    }
    return won ? 'handWon' : 'handLost';
  }

  private playerBluffShown(): boolean {
    const cards = playerCardsShown(this.hand, this.seat);
    if (cards === null || !this.hand.playerRiverBet) {
      return false;
    }
    return strengthOf(cards, this.hand.board, this.luck) === 'weak';
  }

  private unprompted(candidate: Candidate, nowMs: number): LineIntent | null {
    const { situation, strength, key } = candidate;
    const sameStreet = !HAND_END.has(situation) && this.usedStreets.has(key);
    if (nowMs - this.lastLineAt < PACE_MS || sameStreet) {
      return null;
    }
    const draw = drawLine(
      { habits: this.habits, situation, strength, speakFactor: this.heart.speakFactor() },
      this.rng,
    );
    if (!draw.speak) {
      return null;
    }
    this.lastLineAt = nowMs;
    this.usedStreets.add(key);
    this.usedStreets.add(this.streetKey());
    return this.intent(candidate, draw);
  }

  private streetKey(): string {
    return `${this.hand.handNumber}:${this.hand.street}`;
  }

  private intent(candidate: Candidate, draw: Draw): LineIntent {
    const { street, handNumber } = this.hand;
    const { situation, strength } = candidate;
    const actionStreet = candidate.street;
    return {
      situation,
      hint: draw.hint,
      honest: draw.honest,
      strength,
      street,
      actionStreet,
      handNumber,
    };
  }

  private strength(): StrengthClass {
    const { her, board } = this.hand;
    if (her === null) {
      return UNKNOWN_STRENGTH;
    }
    let cached = this.strengths.get(board.length);
    if (cached === undefined) {
      cached = strengthOf(her, board, this.luck);
      this.strengths.set(board.length, cached);
    }
    return cached;
  }
}

export function createTalk(options: TalkOptions): Talk {
  return new TableTalk(options);
}
