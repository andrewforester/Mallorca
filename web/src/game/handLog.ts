import type { LogEntry, Street } from '../engine/index.ts';

export type StreetName = Exclude<Street, 'complete'>;

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
  let first = start;
  while (first > 0 && entries[first - 1]?.key === 'toppedUp') {
    first -= 1;
  }
  return [...entries.slice(first, start), ...entries.slice(start + 1)];
}

function cardsOf(entry: LogEntry): string[] {
  return String(entry.params.cards ?? '')
    .split(' ')
    .filter(Boolean);
}

export function groupHand(entries: LogEntry[]): StreetGroup[] {
  const groups: StreetGroup[] = [{ street: 'preflop', cards: [], pot: 0, entries: [] }];
  for (const entry of lastHand(entries)) {
    const current = groups[groups.length - 1] as StreetGroup;
    const pot = Number(entry.params.pot ?? 0);
    if (DEALT.has(entry.key)) {
      groups.push({ street: entry.key as StreetName, cards: cardsOf(entry), pot, entries: [] });
    } else if (entry.key === 'show' && current.street !== 'showdown') {
      groups.push({ street: 'showdown', cards: [], pot, entries: [entry] });
    } else {
      current.entries.push(entry);
    }
  }
  return groups;
}
