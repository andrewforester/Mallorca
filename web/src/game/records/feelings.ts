import type {
  Impulse,
  JournalEntry,
  Moment,
  PersonaReader,
  TableEvent,
} from '../../persona/index.ts';

export interface RecordedFeeling {
  eventIndex: number;
  journalId: number;
  event: TableEvent;
  impulses: Impulse[];
  words: string[];
}

export function feelingsOf(
  entries: readonly JournalEntry[],
  moments: readonly Moment[],
  base: number,
): RecordedFeeling[] {
  const owner = new Map<number, number>();
  moments.forEach((moment, k) => moment.journalIds.forEach((id) => owner.set(id, base + k)));
  return entries
    .map((entry) => ({
      eventIndex: owner.get(entry.id) ?? base - 1,
      journalId: entry.id,
      event: entry.event,
      impulses: entry.impulses,
      words: entry.words,
    }))
    .filter((felt) => felt.eventIndex >= 0);
}

export type FeelingCollector = (
  her: PersonaReader,
  moments: readonly Moment[],
  base: number,
) => RecordedFeeling[];

export function feelingCollector(): FeelingCollector {
  let seen = 0;
  return (her, moments, base) => {
    const from = her.lastJournalId() < seen ? 0 : seen;
    seen = her.lastJournalId();
    return feelingsOf(her.journalSince(from), moments, base);
  };
}

export type Said = (journalId: number) => string | null;

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const bb = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)} bb`;

function eventText(e: TableEvent): string {
  switch (e.kind) {
    case 'deal':
      return `dealt, equity ${pct(e.equity)}`;
    case 'street':
      return `equity now ${pct(e.equity)}, pot ${e.potBb.toFixed(1)} bb`;
    case 'opponentBet':
      return `player ${e.raise === true ? 'raises' : 'bets'} ${e.sizeBb.toFixed(1)} bb, equity ${pct(e.equity)}`;
    case 'result':
      return `hand over, ${bb(e.netBb)}`;
    case 'bluff':
      return e.succeeded ? 'her bluff got through' : 'her bluff was caught';
    case 'mistake':
      return `her mistake, ${bb(-e.costBb)}`;
    case 'ownMove':
      return e.move === 'bet'
        ? `she bets ${e.amountBb.toFixed(1)} bb, equity ${pct(e.equity)}`
        : `she folds to ${e.facingBb.toFixed(1)} bb, equity ${pct(e.equity)}`;
    case 'chat':
      return `player says ${e.signal}`;
  }
}

const QUIET: ReadonlySet<TableEvent['kind']> = new Set(['deal', 'street', 'ownMove']);

export function worthALine(felt: RecordedFeeling): boolean {
  return felt.impulses.length > 0 || !QUIET.has(felt.event.kind);
}

export function feelingLine(felt: RecordedFeeling, said: Said): string {
  const impulses =
    felt.impulses.length === 0
      ? 'no impulse'
      : felt.impulses.map((i) => `${i.emotion} +${i.amount.toFixed(2)} ${i.reason}`).join(', ');
  const words = felt.words.length === 0 ? 'none' : felt.words.join(', ');
  const line = said(felt.journalId);
  const says = line === null ? '' : ` | says "${line}"`;
  return `  ~ she feels (${eventText(felt.event)}): ${impulses} | mood: ${words}${says}`;
}
