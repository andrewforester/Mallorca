import { describe, expect, it } from 'vitest';
import type { JournalEntry, Moment } from '../../persona/index.ts';
import { feelingsOf } from './feelings.ts';

const entry = (id: number): JournalEntry => ({
  id,
  handNumber: 3,
  event: { kind: 'chat', signal: 'tease' },
  impulses: [{ emotion: 'anger', amount: 0.2, reason: 'his tease' }],
  words: ['tense'],
});

const moment = (journalIds: number[]): Moment => ({ journalIds }) as unknown as Moment;

describe('feelingsOf', () => {
  it('points each entry at the event that made it', () => {
    const felt = feelingsOf([entry(4), entry(5)], [moment([]), moment([4, 5])], 10);
    expect(felt.map((f) => f.eventIndex)).toEqual([11, 11]);
    expect(felt[0]).toMatchObject({ journalId: 4, words: ['tense'] });
    expect(felt[0]?.impulses[0]?.reason).toBe('his tease');
  });

  it('points an entry between events at the event before it and drops one before the hand', () => {
    expect(feelingsOf([entry(7)], [moment([])], 6).map((f) => f.eventIndex)).toEqual([5]);
    expect(feelingsOf([entry(7)], [moment([])], 0)).toEqual([]);
  });
});
