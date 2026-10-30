import type { Action, EngineEvent, Hand, LogEntry, SeatIndex } from '../engine/index.ts';
import type { HandCategory } from '../equity/index.ts';

export interface HandResult {
  winner: SeatIndex | null;
  category: HandCategory | null;
  showdown: boolean;
  amount: number;
}

export function isOpeningBet(hand: Hand, action: Action): boolean {
  return action.kind === 'raise' && hand.bets[0] === 0 && hand.bets[1] === 0;
}

export function openingEntries(entries: LogEntry[], opens: boolean): LogEntry[] {
  if (!opens) {
    return entries;
  }
  return entries.map((entry) => (entry.key === 'raise' ? { ...entry, key: 'bet' } : entry));
}

export function actedLabel(
  event: Extract<EngineEvent, { type: 'acted' }>,
  opens: boolean,
): LogEntry {
  if (event.allIn && event.action.kind !== 'fold') {
    return { key: 'allIn', params: {} };
  }
  switch (event.action.kind) {
    case 'fold':
    case 'check':
      return { key: event.action.kind, params: {} };
    case 'call':
      return { key: 'call', params: { amount: event.amount } };
    case 'raise':
      return { key: opens ? 'bet' : 'raiseTo', params: { amount: event.action.to } };
  }
}

export function resultOf(events: EngineEvent[]): Omit<HandResult, 'amount'> {
  const awards: [number, number] = [0, 0];
  let hands: Extract<EngineEvent, { type: 'showdown' }>['hands'] | null = null;
  for (const event of events) {
    if (event.type === 'potAwarded') {
      awards[event.seat] += event.amount;
    } else if (event.type === 'showdown') {
      hands = event.hands;
    }
  }
  let winner: SeatIndex | null;
  if (hands !== null) {
    winner = hands[0].rank === hands[1].rank ? null : hands[0].rank > hands[1].rank ? 0 : 1;
  } else {
    winner = awards[0] > 0 ? 0 : 1;
  }
  const shown = hands === null ? null : hands[winner ?? 0];
  return {
    winner,
    category: shown === null ? null : shown.category,
    showdown: hands !== null,
  };
}

export function potCollected(paid: [number, number], winner: SeatIndex | null): number {
  const matched = Math.min(paid[0], paid[1]);
  return winner === null ? matched : matched * 2;
}

export function awardedTo(events: EngineEvent[], seat: SeatIndex): number {
  let total = 0;
  for (const event of events) {
    if (event.type === 'potAwarded' && event.seat === seat) {
      total += event.amount;
    }
  }
  return total;
}

export type SeatActions = [LogEntry | null, LogEntry | null];

export interface StreetActions {
  last: SeatActions;
  closing: SeatActions;
}

export function streetActions(
  previous: StreetActions,
  events: EngineEvent[],
  opens: boolean,
): StreetActions {
  const last: SeatActions = [...previous.last];
  let closing: SeatActions = previous.closing;
  for (const event of events) {
    if (event.type === 'acted') {
      last[event.seat] = actedLabel(event, opens);
    } else if (event.type === 'streetDealt') {
      if (last[0] !== null || last[1] !== null) {
        closing = [last[0], last[1]];
      }
      last[0] = null;
      last[1] = null;
    }
  }
  return { last, closing };
}
