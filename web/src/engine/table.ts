import { fullDeck, shuffle } from '../cards/index.ts';
import type { Rng } from '../cards/index.ts';
import { applyAction, startHandWith } from './hand.ts';
import { legalActions, otherSeat } from './legal.ts';
import { rulesOf } from './rules.ts';
import type { Action, EngineEvent, Hand, LegalActions, Seat, SeatIndex, Step } from './types.ts';

export { BIG_BLINDS, blindsFor } from './rules.ts';

export type TableMode = { kind: 'tournament' } | { kind: 'cash'; bigBlind: number; buyIn: number };

export const TOURNAMENT: TableMode = { kind: 'tournament' };

export const CASH: TableMode = { kind: 'cash', bigBlind: 20, buyIn: 2000 };

export const TOURNAMENT_STACK = 2000;

export function startingStack(mode: TableMode): number {
  return mode.kind === 'cash' ? mode.buyIn : TOURNAMENT_STACK;
}

export interface Table {
  mode: TableMode;
  seats: [Seat, Seat];
  button: SeatIndex;
  handNumber: number;
  hand: Hand | null;
  winner: SeatIndex | null;
}

export function createTable(
  names: [string, string],
  mode: TableMode,
  firstButton: SeatIndex = 0,
): Table {
  const stack = startingStack(mode);
  return {
    mode,
    seats: [
      { name: names[0], stack },
      { name: names[1], stack },
    ],
    button: firstButton,
    handNumber: 0,
    hand: null,
    winner: null,
  };
}

export function startHand(t: Table, rng: Rng): { state: Table; events: EngineEvent[] } {
  if (t.winner !== null) {
    throw new Error('The tournament is over');
  }
  if (t.hand !== null && t.hand.street !== 'complete') {
    throw new Error('A hand is still in progress');
  }
  const handNumber = t.handNumber + 1;
  const button = t.handNumber === 0 ? t.button : otherSeat(t.button);
  const rules = rulesOf(t.mode);
  const prepared = rules.beforeHand(t.seats);
  const step = startHandWith(
    prepared.seats,
    { button, blinds: rules.blinds(handNumber), handNumber },
    shuffle(fullDeck(), rng),
  );
  const concluded = conclude({ ...t, button, handNumber }, step);
  return { state: concluded.state, events: [...prepared.events, ...concluded.events] };
}

function conclude(t: Table, step: Step): { state: Table; events: EngineEvent[] } {
  const events = [...step.events];
  let winner: SeatIndex | null = null;
  if (step.hand.street === 'complete') {
    winner = rulesOf(t.mode).isOver(step.seats);
    if (winner !== null) {
      events.push({ type: 'tournamentEnded', winner });
    }
  }
  return { state: { ...t, seats: step.seats, hand: step.hand, winner }, events };
}

export function legalActionsOf(t: Table): LegalActions {
  if (t.hand === null) {
    return { fold: false, check: false, call: null, raise: null };
  }
  return legalActions(t.hand, t.seats);
}

export function toAct(t: Table): SeatIndex | null {
  return t.hand === null ? null : t.hand.toAct;
}

export function apply(t: Table, action: Action): { state: Table; events: EngineEvent[] } {
  if (t.hand === null) {
    throw new Error('No hand in progress');
  }
  return conclude(t, applyAction(t.hand, t.seats, action));
}
