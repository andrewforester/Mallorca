import type { Card } from '../cards/index.ts';
import type { HandCategory } from '../equity/index.ts';

export type SeatIndex = 0 | 1;

export interface Seat {
  name: string;
  stack: number;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';

export interface Hand {
  street: Street;
  button: SeatIndex;
  deck: Card[];
  holeCards: [[Card, Card], [Card, Card]];
  board: Card[];
  bets: [number, number];
  committed: [number, number];
  pot: number;
  toAct: SeatIndex | null;
  lastRaise: number;
  actedThisStreet: [boolean, boolean];
  canRaise: [boolean, boolean];
  bigBlind: number;
}

export type Action =
  { kind: 'fold' } | { kind: 'check' } | { kind: 'call' } | { kind: 'raise'; to: number };

export interface LegalActions {
  fold: boolean;
  check: boolean;
  call: number | null;
  raise: { min: number; max: number } | null;
}

export interface ShowdownHand {
  cards: [Card, Card];
  rank: number;
  category: HandCategory;
}

export type EngineEvent =
  | {
      type: 'handStarted';
      handNumber: number;
      button: SeatIndex;
      smallBlind: number;
      bigBlind: number;
      stacks: [number, number];
    }
  | { type: 'blindPosted'; seat: SeatIndex; amount: number }
  | { type: 'holeCards'; seat: SeatIndex; cards: [Card, Card] }
  | { type: 'acted'; seat: SeatIndex; action: Action; amount: number; allIn: boolean }
  | {
      type: 'streetDealt';
      street: 'flop' | 'turn' | 'river';
      cards: Card[];
      board: Card[];
      pot: number;
    }
  | { type: 'showdown'; hands: [ShowdownHand, ShowdownHand]; pot: number }
  | { type: 'betReturned'; seat: SeatIndex; amount: number }
  | { type: 'potAwarded'; seat: SeatIndex; amount: number }
  | { type: 'handEnded'; stacks: [number, number] }
  | { type: 'toppedUp'; seat: SeatIndex; amount: number }
  | { type: 'tournamentEnded'; winner: SeatIndex };

export interface Step {
  hand: Hand;
  seats: [Seat, Seat];
  events: EngineEvent[];
}
