import { formatCard } from '../cards/index.ts';
import type { Card } from '../cards/index.ts';
import type { Action, EngineEvent, SeatIndex } from './types.ts';

export interface LogEntry {
  key: string;
  params: Record<string, string | number>;
}

function cardsText(cards: readonly Card[]): string {
  return cards.map(formatCard).join(' ');
}

function describeAction(seat: SeatIndex, action: Action, amount: number): LogEntry {
  switch (action.kind) {
    case 'fold':
    case 'check':
      return { key: action.kind, params: { seat } };
    case 'call':
      return { key: 'call', params: { seat, amount } };
    case 'raise':
      return { key: 'raise', params: { seat, amount: action.to } };
  }
}

const SEAT_AMOUNT_KEYS = {
  blindPosted: 'post',
  betReturned: 'returned',
  potAwarded: 'win',
  toppedUp: 'toppedUp',
} as const;

type SeatAmountEvent = Extract<EngineEvent, { type: keyof typeof SEAT_AMOUNT_KEYS }>;

function isSeatAmount(event: EngineEvent): event is SeatAmountEvent {
  return event.type in SEAT_AMOUNT_KEYS;
}

function describeEvent(event: EngineEvent): LogEntry[] {
  if (isSeatAmount(event)) {
    return [
      { key: SEAT_AMOUNT_KEYS[event.type], params: { seat: event.seat, amount: event.amount } },
    ];
  }
  switch (event.type) {
    case 'handStarted':
      return [
        {
          key: 'handStarted',
          params: { number: event.handNumber, small: event.smallBlind, big: event.bigBlind },
        },
      ];
    case 'acted': {
      const line = describeAction(event.seat, event.action, event.amount);
      return event.allIn ? [line, { key: 'allIn', params: { seat: event.seat } }] : [line];
    }
    case 'streetDealt':
      return [{ key: event.street, params: { cards: cardsText(event.cards), pot: event.pot } }];
    case 'showdown':
      return event.hands.map((hand, seat) => ({
        key: 'show',
        params: { seat, cards: cardsText(hand.cards), category: hand.category, pot: event.pot },
      }));
    case 'tournamentEnded':
      return [{ key: 'winTournament', params: { seat: event.winner } }];
    case 'holeCards':
    case 'handEnded':
      return [];
  }
}

export function handHistory(events: EngineEvent[]): LogEntry[] {
  return events.flatMap(describeEvent);
}
