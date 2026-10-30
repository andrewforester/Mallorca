import type { Card, Rng } from '../cards/index.ts';
import { formatCard } from '../cards/index.ts';
import type { EngineEvent, SeatIndex, ShowdownHand } from '../engine/index.ts';
import { equityVsHand, equityVsRange } from '../equity/index.ts';

type Stacks = [number, number];

export interface HandState {
  handNumber: number;
  bigBlind: number;
  street: string;
  board: Card[];
  pot: number;
  stacks: Stacks;
  startStack: number;
  her: [Card, Card] | null;
  actions: string[];
  actionBoard: Card[];
  showdown: [ShowdownHand, ShowdownHand] | null;
  awarded: Stacks;
  herLateBet: boolean;
  playerRiverBet: boolean;
  playerAllIn: boolean;
  ended: boolean;
}

export const NO_HAND: HandState = {
  handNumber: 0,
  bigBlind: 1,
  street: 'preflop',
  board: [],
  pot: 0,
  stacks: [0, 0],
  startStack: 0,
  her: null,
  actions: [],
  actionBoard: [],
  showdown: null,
  awarded: [0, 0],
  herLateBet: false,
  playerRiverBet: false,
  playerAllIn: false,
  ended: false,
};

const FULL_BOARD = 5;
const TURN_BOARD = 4;
const PREFLOP_SAMPLES = 2000;

type EventType = EngineEvent['type'];
type EventOf<K extends EventType> = Extract<EngineEvent, { type: K }>;
type Handler<K extends EventType> = (
  state: HandState,
  event: EventOf<K>,
  seat: SeatIndex,
) => HandState;
type Handlers = { [K in EventType]: Handler<K> };

const nameOf = (seat: SeatIndex, her: SeatIndex): string => (seat === her ? 'Mallorca' : 'player');
const cardsText = (cards: readonly Card[]): string => cards.map(formatCard).join(' ');
const otherOf = (seat: SeatIndex): SeatIndex => (seat === 0 ? 1 : 0);

function moved(stacks: Stacks, seat: SeatIndex, delta: number): Stacks {
  const next: Stacks = [stacks[0], stacks[1]];
  next[seat] += delta;
  return next;
}

function actionText(event: EventOf<'acted'>, who: string): string {
  const allIn = event.allIn ? ', all in' : '';
  const { action } = event;
  if (action.kind === 'raise') {
    return `${who} raises to ${action.to}${allIn}`;
  }
  if (action.kind === 'call') {
    return `${who} calls ${event.amount}${allIn}`;
  }
  return `${who} ${action.kind}s`;
}

const onActed: Handler<'acted'> = (state, event, seat) => {
  const mine = event.seat === seat;
  const raise = event.action.kind === 'raise';
  return {
    ...state,
    pot: state.pot + event.amount,
    stacks: moved(state.stacks, event.seat, -event.amount),
    actions: [...state.actions, actionText(event, nameOf(event.seat, seat))],
    actionBoard: state.board,
    herLateBet: state.herLateBet || (mine && raise && state.board.length >= TURN_BOARD),
    playerRiverBet: state.playerRiverBet || (!mine && raise && state.board.length === FULL_BOARD),
    playerAllIn: state.playerAllIn || (!mine && event.allIn),
  };
};

const HANDLERS: Handlers = {
  handStarted: (_state, event, seat) => ({
    ...NO_HAND,
    handNumber: event.handNumber,
    bigBlind: event.bigBlind,
    stacks: [event.stacks[0], event.stacks[1]],
    startStack: event.stacks[seat],
  }),
  blindPosted: (state, event, seat) => ({
    ...state,
    pot: state.pot + event.amount,
    stacks: moved(state.stacks, event.seat, -event.amount),
    actions: [...state.actions, `${nameOf(event.seat, seat)} posts ${event.amount}`],
  }),
  holeCards: (state, event, seat) =>
    event.seat === seat ? { ...state, her: [event.cards[0], event.cards[1]] } : state,
  acted: onActed,
  streetDealt: (state, event) => ({
    ...state,
    street: event.street,
    board: [...event.board],
    actions: [...state.actions, `${event.street} ${cardsText(event.cards)}`],
  }),
  showdown: (state, event, seat) => ({
    ...state,
    street: 'showdown',
    showdown: event.hands,
    actions: [
      ...state.actions,
      ...([0, 1] as const).map(
        (s) => `${nameOf(s, seat)} shows ${cardsText(event.hands[s].cards)}`,
      ),
    ],
  }),
  betReturned: (state, event) => ({
    ...state,
    pot: state.pot - event.amount,
    stacks: moved(state.stacks, event.seat, event.amount),
  }),
  potAwarded: (state, event, seat) => ({
    ...state,
    stacks: moved(state.stacks, event.seat, event.amount),
    awarded: moved(state.awarded, event.seat, event.amount),
    actions: [...state.actions, `${nameOf(event.seat, seat)} wins ${event.amount}`],
  }),
  handEnded: (state, event) => ({
    ...state,
    street: 'complete',
    stacks: [event.stacks[0], event.stacks[1]],
    ended: true,
  }),
  toppedUp: (state) => state,
  tournamentEnded: (state) => state,
};

export function track(state: HandState, event: EngineEvent, seat: SeatIndex): HandState {
  const handler = HANDLERS[event.type] as Handler<EventType>;
  return handler(state, event, seat);
}

export function netOf(state: HandState, seat: SeatIndex): number {
  return (state.stacks[seat] - state.startStack) / state.bigBlind;
}

function allInEquity(
  hero: readonly [Card, Card],
  villain: readonly [Card, Card],
  board: readonly Card[],
  rng: Rng,
): number {
  if (board.length === 0) {
    return equityVsRange(hero, [{ cards: villain, weight: 1 }], board, {
      rng,
      samples: PREFLOP_SAMPLES,
    });
  }
  return equityVsHand(hero, villain, board);
}

export function luckOf(state: HandState, seat: SeatIndex, rng: Rng): number | null {
  if (state.showdown === null || state.actionBoard.length === FULL_BOARD) {
    return null;
  }
  const equity = allInEquity(
    state.showdown[seat].cards,
    state.showdown[otherOf(seat)].cards,
    state.actionBoard,
    rng,
  );
  const pot = state.awarded[0] + state.awarded[1];
  return (state.awarded[seat] - equity * pot) / state.bigBlind;
}

export function playerCardsShown(state: HandState, seat: SeatIndex): [Card, Card] | null {
  return state.showdown === null ? null : state.showdown[otherOf(seat)].cards;
}
