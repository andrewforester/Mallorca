import { mulberry32 } from '../cards/index.ts';
import type { Card, Rng } from '../cards/index.ts';
import type { EngineEvent, SeatIndex } from '../engine/index.ts';
import { BASE_HABITS, habitsAt } from './habits.ts';
import type { Habit, Habits, Level, Situation } from './habits.ts';
import type { Impulse, Personality, Snapshot } from '../emotion/index.ts';
import { characterOf, feelingState } from './state.ts';
import type { Character, FeelingState } from './state.ts';
import { createPersona, netOf } from '../persona/index.ts';
import type {
  Bias,
  HandState,
  JournalEntry as PersonaEntry,
  Moment,
  Persona,
  Signal,
  Stance,
  StrengthClass,
} from '../persona/index.ts';
import { EMPTY_SUMMARY, withHand, withSignals } from './summary.ts';
import type { SessionSummary } from './summary.ts';

export interface JournalEntry extends PersonaEntry {
  spoke: boolean;
}

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

export interface Conversation {
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
  journal(): JournalEntry[];
  bias(): Bias;
  summary(): SessionSummary;
  setLevel(level: Level): void;
}

export interface ConversationOptions {
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
const HAND_END: ReadonlySet<Situation> = new Set<Situation>(['handWon', 'handLost', 'bluffCaught']);

const streetKeyOf = (hand: HandState): string => `${hand.handNumber}:${hand.street}`;

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

class TableConversation implements Conversation {
  private readonly seat: SeatIndex;
  private readonly rng: Rng;
  private readonly base: Habits;
  private habits: Habits;
  private readonly persona: Persona;
  private session: SessionSummary = EMPTY_SUMMARY;
  private last: Situation | null = null;
  private lastLineAt = Number.NEGATIVE_INFINITY;
  private readonly usedStreets = new Set<string>();
  private readonly spoke = new Set<number>();
  private impulseCursor = 0;
  private now = 0;

  constructor(options: ConversationOptions) {
    this.seat = options.seat;
    this.rng = options.rng;
    const luck = options.luckRng ?? mulberry32(Math.floor(options.rng.next() * SEED_RANGE));
    this.base = options.habits ?? BASE_HABITS;
    this.habits = habitsAt(this.base, options.level);
    this.persona = createPersona({ seat: this.seat, rng: luck });
  }

  observe(events: readonly EngineEvent[], nowMs: number): LineIntent | null {
    this.now = Math.max(this.now, nowMs);
    const lastId = this.persona.lastJournalId();
    let candidate: Candidate | null = null;
    for (const moment of this.persona.observe(events, nowMs)) {
      candidate = this.step(moment) ?? candidate;
    }
    const intent = candidate === null ? null : this.unprompted(candidate, nowMs);
    if (intent !== null) {
      this.persona.journalSince(lastId).forEach((e) => this.spoke.add(e.id));
    }
    return intent;
  }

  hear(signals: readonly Signal[]): void {
    this.persona.hear(signals);
    this.session = withSignals(this.session, signals);
  }

  playerRange(weights: ArrayLike<number>, handNumber: number): void {
    this.persona.narrow(weights, handNumber);
  }

  replyIntent(): LineIntent {
    const situation = this.last ?? 'herCall';
    const strength = this.persona.strength();
    const habit = this.habits[situation][strength];
    const { honest, hint } = drawHint(habit, situation, strength, this.rng);
    return this.intent(
      { situation, strength, key: '', street: this.hand().street },
      {
        speak: true,
        honest,
        hint,
      },
    );
  }

  facts(): HandFacts {
    const { street, board, pot, stacks, her, actions, bigBlind } = this.hand();
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
    return this.persona.view(this.now).words;
  }

  feeling(): Snapshot {
    return this.persona.view(this.now).snapshot;
  }

  feelingAt(nowMs: number): Snapshot {
    return this.persona.view(nowMs).snapshot;
  }

  impulses(): Impulse[] {
    const fresh = this.persona.journalSince(this.impulseCursor);
    this.impulseCursor = this.persona.lastJournalId();
    return fresh.flatMap((e) => e.impulses);
  }

  stance(): Stance | null {
    return this.persona.view(this.now).stance;
  }

  feelingFor(intent: LineIntent): FeelingState {
    return feelingState(this.feeling(), intent.honest ? null : intent.hint);
  }

  character(): Character {
    return characterOf(this.persona.view(this.now).personality);
  }

  setPersonality(p: Personality): void {
    this.persona.setPersonality(p);
  }

  resetFeeling(): void {
    this.persona.reset();
    this.spoke.clear();
  }

  journal(): JournalEntry[] {
    return this.persona.journal().map((e) => ({ ...e, spoke: this.spoke.has(e.id) }));
  }

  bias(): Bias {
    return this.persona.view(this.now).bias;
  }

  summary(): SessionSummary {
    return this.session;
  }

  setLevel(level: Level): void {
    this.habits = habitsAt(this.base, level);
  }

  private hand(): HandState {
    return this.persona.view(this.now).hand;
  }

  private step(moment: Moment): Candidate | null {
    const { event, before } = moment;
    if (event.type === 'handStarted') {
      this.usedStreets.clear();
      this.last = null;
    }
    const situation =
      event.type === 'handEnded' ? this.endHand(moment) : actedSituation(event, this.seat);
    if (situation === null) {
      return null;
    }
    this.last = situation;
    const strength = moment.strength ?? this.persona.strength();
    return { situation, strength, key: streetKeyOf(before), street: before.street };
  }

  private endHand(moment: Moment): Situation {
    const hand = moment.after;
    const strength = moment.strength ?? this.persona.strength();
    const won = hand.awarded[this.seat] > 0;
    const bluffCaught = !won && hand.showdown !== null && strength === 'weak' && hand.herLateBet;
    this.session = withHand(this.session, {
      netBb: netOf(hand, this.seat),
      playerBluffShown: moment.playerBluffShown,
      playerAllIn: hand.playerAllIn,
    });
    if (bluffCaught) {
      return 'bluffCaught';
    }
    return won ? 'handWon' : 'handLost';
  }

  private unprompted(candidate: Candidate, nowMs: number): LineIntent | null {
    const { situation, strength, key } = candidate;
    const sameStreet = !HAND_END.has(situation) && this.usedStreets.has(key);
    if (nowMs - this.lastLineAt < PACE_MS || sameStreet) {
      return null;
    }
    const draw = drawLine(
      {
        habits: this.habits,
        situation,
        strength,
        speakFactor: this.persona.view(nowMs).speakFactor,
      },
      this.rng,
    );
    if (!draw.speak) {
      return null;
    }
    this.lastLineAt = nowMs;
    this.usedStreets.add(key);
    this.usedStreets.add(streetKeyOf(this.hand()));
    return this.intent(candidate, draw);
  }

  private intent(candidate: Candidate, draw: Draw): LineIntent {
    const { street, handNumber } = this.hand();
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
}

export function createConversation(options: ConversationOptions): Conversation {
  return new TableConversation(options);
}
