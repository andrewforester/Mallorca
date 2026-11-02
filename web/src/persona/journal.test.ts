import { describe, expect, it } from 'vitest';
import { Journal } from './journal.ts';
import type { Felt } from './journal.ts';

const felt = (handNumber: number): Felt => ({
  handNumber,
  event: { kind: 'chat', signal: 'tease' },
  impulses: [],
});

describe('the journal', () => {
  it('returns the ids it added', () => {
    const journal = new Journal();
    journal.add([felt(1)], []);
    const n = journal.last();
    expect(journal.add([felt(1), felt(2)], [])).toEqual([n + 1, n + 2]);
  });
});
