import type { Card } from '../cards/index.ts';
import { parseCard } from '../cards/index.ts';
import type { Action, DealtStreet, EngineEvent, SeatIndex } from '../engine/index.ts';

export type Who = 'hero' | 'villain';

export type Observation =
  | {
      type: 'handStarted';
      handNumber: number;
      heroOnButton: boolean;
      heroStack: number;
      villainStack: number;
      smallBlind: number;
      bigBlind: number;
    }
  | { type: 'holeCards'; cards: [Card, Card] }
  | { type: 'acted'; who: Who; action: Action; amount: number }
  | { type: 'street'; street: DealtStreet; board: Card[] };

export type ObservationJson =
  | Extract<Observation, { type: 'handStarted' } | { type: 'acted' }>
  | { type: 'holeCards'; cards: string[] }
  | { type: 'street'; street: string; board: string[] };

export function toObservations(events: EngineEvent[], heroSeat: SeatIndex): Observation[] {
  const villainSeat: SeatIndex = heroSeat === 0 ? 1 : 0;
  const result: Observation[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'handStarted':
        result.push({
          type: 'handStarted',
          handNumber: event.handNumber,
          heroOnButton: event.button === heroSeat,
          heroStack: event.stacks[heroSeat],
          villainStack: event.stacks[villainSeat],
          smallBlind: event.smallBlind,
          bigBlind: event.bigBlind,
        });
        break;
      case 'holeCards':
        if (event.seat === heroSeat) {
          result.push({ type: 'holeCards', cards: [event.cards[0], event.cards[1]] });
        }
        break;
      case 'acted':
        result.push({
          type: 'acted',
          who: event.seat === heroSeat ? 'hero' : 'villain',
          action: event.action,
          amount: event.amount,
        });
        break;
      case 'streetDealt':
        result.push({ type: 'street', street: event.street, board: [...event.board] });
        break;
      default:
        break;
    }
  }
  return result;
}

function parseStreet(street: string): DealtStreet {
  if (street === 'flop' || street === 'turn' || street === 'river') {
    return street;
  }
  throw new Error(`Invalid street: ${street}`);
}

export function parseObservation(raw: ObservationJson): Observation {
  switch (raw.type) {
    case 'holeCards': {
      const [first = '', second = ''] = raw.cards;
      return { type: 'holeCards', cards: [parseCard(first), parseCard(second)] };
    }
    case 'street':
      return { type: 'street', street: parseStreet(raw.street), board: raw.board.map(parseCard) };
    default:
      return raw;
  }
}
