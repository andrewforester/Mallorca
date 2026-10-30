import type { LogEntry } from '../game/index.ts';

export type StreetName = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface StreetGroup {
  street: StreetName;
  cards: string[];
  pot: number;
  entries: LogEntry[];
}

const DEALT = new Set<string>(['flop', 'turn', 'river']);

function lastHand(entries: LogEntry[]): LogEntry[] {
  let start = -1;
  entries.forEach((entry, index) => {
    if (entry.key === 'handStarted') {
      start = index;
    }
  });
  return entries.slice(start + 1);
}

function applyChips(entry: LogEntry, totals: Map<number, number>): void {
  const seat = Number(entry.params.seat);
  const amount = Number(entry.params.amount);
  const current = totals.get(seat) ?? 0;
  if (entry.key === 'post' || entry.key === 'call') {
    totals.set(seat, current + amount);
  } else if (entry.key === 'raise' || entry.key === 'bet') {
    totals.set(seat, amount);
  } else if (entry.key === 'returned') {
    totals.set(seat, current - amount);
  }
}

function matched(totals: Map<number, number>): number {
  return 2 * Math.min(totals.get(0) ?? 0, totals.get(1) ?? 0);
}

export function groupHand(entries: LogEntry[]): StreetGroup[] {
  const groups: StreetGroup[] = [{ street: 'preflop', cards: [], pot: 0, entries: [] }];
  let totals = new Map<number, number>();
  let pot = 0;
  const open = (street: StreetName, cards: string[]): void => {
    pot += matched(totals);
    totals = new Map();
    groups.push({ street, cards, pot, entries: [] });
  };
  for (const entry of lastHand(entries)) {
    const current = groups[groups.length - 1] as StreetGroup;
    if (DEALT.has(entry.key)) {
      open(
        entry.key as StreetName,
        String(entry.params.cards ?? '')
          .split(' ')
          .filter(Boolean),
      );
    } else if (entry.key === 'show' && current.street !== 'showdown') {
      open('showdown', []);
      (groups[groups.length - 1] as StreetGroup).entries.push(entry);
    } else {
      applyChips(entry, totals);
      current.entries.push(entry);
    }
  }
  return groups;
}
