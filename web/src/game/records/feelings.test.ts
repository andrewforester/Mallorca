import { describe, expect, it } from 'vitest';
import type { JournalEntry, Moment } from '../../persona/index.ts';
import { feelingLine, feelingsOf } from './feelings.ts';

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

describe('feelingLine', () => {
  it('writes an eased emotion with a minus and a felt one with a plus', () => {
    const line = feelingLine(
      {
        eventIndex: 0,
        journalId: 1,
        event: { kind: 'chat', signal: 'tease' },
        impulses: [
          { emotion: 'joy', amount: 0.5, reason: 'won' },
          { emotion: 'distress', amount: -0.32, reason: 'won' },
        ],
        words: [],
      },
      () => null,
    );
    expect(line).toContain('joy +0.50 won, distress -0.32 won');
  });
});
