import type { Card, Rng } from '../cards/index.ts';
import type { EngineEvent, SeatIndex } from '../engine/index.ts';
import { BASE_HABITS, habitsAt } from './habits.ts';
import type { Habit, Habits, Level, Situation } from './habits.ts';
import { characterOf, feelingState } from './state.ts';
import type { Character, FeelingState } from './state.ts';
import type {
  HandState,
  Moment,
  PersonaReader,
  PersonaView,
  Signal,
  StrengthClass,
} from '../persona/index.ts';
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

export interface Conversation {
  observe(moments: readonly Moment[], persona: PersonaReader, nowMs: number): LineIntent | null;
  replyIntent(persona: PersonaReader, nowMs: number): LineIntent;
  facts(view: PersonaView): HandFacts;
  moodWords(view: PersonaView): string[];
  feelingFor(intent: LineIntent, view: PersonaView): FeelingState;
  character(view: PersonaView): Character;
  heard(signals: readonly Signal[]): void;
  summary(): SessionSummary;
  setLevel(level: Level): void;
}

export interface ConversationOptions {
  seat: SeatIndex;
  rng: Rng;
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
  private session: SessionSummary = EMPTY_SUMMARY;
  private last: Situation | null = null;
  private lastLineAt = Number.NEGATIVE_INFINITY;
  private readonly usedStreets = new Set<string>();

  constructor(options: ConversationOptions) {
    this.seat = options.seat;
    this.rng = options.rng;
    this.base = options.habits ?? BASE_HABITS;
    this.habits = habitsAt(this.base, options.level);
  }

  observe(moments: readonly Moment[], persona: PersonaReader, nowMs: number): LineIntent | null {
    let candidate: Candidate | null = null;
    for (const moment of moments) {
      candidate = this.step(moment, persona) ?? candidate;
    }
    return candidate === null ? null : this.unprompted(candidate, persona.view(nowMs), nowMs);
  }

  replyIntent(persona: PersonaReader, nowMs: number): LineIntent {
    const situation = this.last ?? 'herCall';
    const strength = persona.strength();
    const habit = this.habits[situation][strength];
    const { honest, hint } = drawHint(habit, situation, strength, this.rng);
    const { hand } = persona.view(nowMs);
    return this.intent(
      { situation, strength, key: '', street: hand.street },
      { speak: true, honest, hint },
      hand,
    );
  }

  facts(view: PersonaView): HandFacts {
    const { street, board, pot, stacks, her, actions, bigBlind } = view.hand;
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

  moodWords(view: PersonaView): string[] {
    return view.words;
  }

  feelingFor(intent: LineIntent, view: PersonaView): FeelingState {
    return feelingState(view.snapshot, intent.honest ? null : intent.hint);
  }

  character(view: PersonaView): Character {
    return characterOf(view.personality);
  }

  heard(signals: readonly Signal[]): void {
    this.session = withSignals(this.session, signals);
  }

  summary(): SessionSummary {
    return this.session;
  }

  setLevel(level: Level): void {
    this.habits = habitsAt(this.base, level);
  }

  private step(moment: Moment, persona: PersonaReader): Candidate | null {
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
    const strength = moment.strength ?? persona.strength();
    return { situation, strength, key: streetKeyOf(before), street: before.street };
  }

  private endHand(moment: Moment): Situation {
    const hand = moment.after;
    const won = hand.awarded[this.seat] > 0;
    const weak = moment.strength === 'weak';
    const bluffCaught = !won && hand.showdown !== null && weak && hand.herLateBet;
    this.session = withHand(this.session, {
      netBb: (hand.stacks[this.seat] - hand.startStack) / hand.bigBlind,
      playerBluffShown: moment.playerBluffShown,
      playerAllIn: hand.playerAllIn,
    });
    if (bluffCaught) {
      return 'bluffCaught';
    }
    return won ? 'handWon' : 'handLost';
  }

  private unprompted(candidate: Candidate, view: PersonaView, nowMs: number): LineIntent | null {
    const { situation, strength, key } = candidate;
    const sameStreet = !HAND_END.has(situation) && this.usedStreets.has(key);
    if (nowMs - this.lastLineAt < PACE_MS || sameStreet) {
      return null;
    }
    const spot = { habits: this.habits, situation, strength, speakFactor: view.speakFactor };
    const draw = drawLine(spot, this.rng);
    if (!draw.speak) {
      return null;
    }
    this.lastLineAt = nowMs;
    this.usedStreets.add(key);
    this.usedStreets.add(streetKeyOf(view.hand));
    return this.intent(candidate, draw, view.hand);
  }

  private intent(candidate: Candidate, draw: Draw, hand: HandState): LineIntent {
    const { situation, strength } = candidate;
    return {
      situation,
      hint: draw.hint,
      honest: draw.honest,
      strength,
      street: hand.street,
      actionStreet: candidate.street,
      handNumber: hand.handNumber,
    };
  }
}

export function createConversation(options: ConversationOptions): Conversation {
  return new TableConversation(options);
}
