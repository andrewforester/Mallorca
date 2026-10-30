import type { Card, Rng } from '../cards/index.ts';
import type { EngineEvent, SeatIndex } from '../engine/index.ts';
import { BASE_HABITS, habitsAt } from './habits.ts';
import type { Habit, Habits, Level, Situation } from './habits.ts';
import { NO_HAND, luckOf, netOf, playerCardsShown, track } from './handTracker.ts';
import type { HandState } from './handTracker.ts';
import { CALM, afterHand, afterSignals, speakFactor } from './mood.ts';
import type { Mood, Signal } from './mood.ts';
import { strengthOf } from './strength.ts';
import type { StrengthClass } from './strength.ts';
import type { Style } from './style.ts';
import { styleOf } from './style.ts';
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
  handNumber: number;
}

export interface Talk {
  observe(events: readonly EngineEvent[], nowMs: number): LineIntent | null;
  hear(signals: readonly Signal[]): void;
  replyIntent(): LineIntent;
  facts(): HandFacts;
  mood(): Mood;
  style(): Style;
  summary(): SessionSummary;
  setLevel(level: Level): void;
}

export interface TalkOptions {
  seat: SeatIndex;
  rng: Rng;
  level: Level;
  habits?: Habits;
}

export interface Spot {
  habits: Habits;
  situation: Situation;
  strength: StrengthClass;
  mood: Mood;
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
}

const PACE_MS = 1500;
const BET_HINT_RATE = 0.7;
const UNKNOWN_STRENGTH: StrengthClass = 'medium';
const HAND_END: ReadonlySet<Situation> = new Set<Situation>(['handWon', 'handLost', 'bluffCaught']);

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
  const chance = Math.min(1, habit.speak * speakFactor(spot.mood));
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
  private readonly base: Habits;
  private habits: Habits;
  private hand: HandState = NO_HAND;
  private feeling: Mood = CALM;
  private session: SessionSummary = EMPTY_SUMMARY;
  private last: Situation | null = null;
  private lastLineAt = Number.NEGATIVE_INFINITY;
  private lastLineKey = '';
  private readonly strengths = new Map<number, StrengthClass>();

  constructor(options: TalkOptions) {
    this.seat = options.seat;
    this.rng = options.rng;
    this.base = options.habits ?? BASE_HABITS;
    this.habits = habitsAt(this.base, options.level);
  }

  observe(events: readonly EngineEvent[], nowMs: number): LineIntent | null {
    let candidate: Candidate | null = null;
    for (const event of events) {
      candidate = this.step(event) ?? candidate;
    }
    return candidate === null ? null : this.unprompted(candidate, nowMs);
  }

  hear(signals: readonly Signal[]): void {
    this.feeling = afterSignals(this.feeling, signals);
    this.session = withSignals(this.session, signals);
  }

  replyIntent(): LineIntent {
    const situation = this.last ?? 'herCall';
    const strength = this.strength();
    const habit = this.habits[situation][strength];
    const { honest, hint } = drawHint(habit, situation, strength, this.rng);
    return this.intent(situation, strength, { speak: true, honest, hint });
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

  mood(): Mood {
    return this.feeling;
  }

  style(): Style {
    return styleOf(this.feeling);
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
    }
    const key = `${this.hand.handNumber}:${this.hand.street}`;
    this.hand = track(this.hand, event, this.seat);
    const situation =
      event.type === 'handEnded' ? this.endHand() : actedSituation(event, this.seat);
    if (situation === null) {
      return null;
    }
    this.last = situation;
    return { situation, strength: this.strength(), key };
  }

  private endHand(): Situation {
    const hand = this.hand;
    const strength = this.strength();
    const won = hand.awarded[this.seat] > 0;
    const bluffCaught = !won && hand.showdown !== null && strength === 'weak' && hand.herLateBet;
    const netBb = netOf(hand, this.seat);
    this.feeling = afterHand(this.feeling, { netBb, luckBb: luckOf(hand, this.seat), bluffCaught });
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
    return strengthOf(cards, this.hand.board, this.rng) === 'weak';
  }

  private unprompted(candidate: Candidate, nowMs: number): LineIntent | null {
    const { situation, strength, key } = candidate;
    const sameStreet = !HAND_END.has(situation) && key === this.lastLineKey;
    if (nowMs - this.lastLineAt < PACE_MS || sameStreet) {
      return null;
    }
    const draw = drawLine(
      { habits: this.habits, situation, strength, mood: this.feeling },
      this.rng,
    );
    if (!draw.speak) {
      return null;
    }
    this.lastLineAt = nowMs;
    this.lastLineKey = key;
    return this.intent(situation, strength, draw);
  }

  private intent(situation: Situation, strength: StrengthClass, draw: Draw): LineIntent {
    const { street, handNumber } = this.hand;
    return { situation, hint: draw.hint, honest: draw.honest, strength, street, handNumber };
  }

  private strength(): StrengthClass {
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
}

export function createTalk(options: TalkOptions): Talk {
  return new TableTalk(options);
}
