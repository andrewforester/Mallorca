import { describe, expect, it } from 'vitest';
import { EMPTY_SUMMARY, since, withHand, withSignals } from './summary.ts';

describe('since', () => {
  it('gives what changed after an earlier summary', () => {
    const first = withSignals(
      withHand(EMPTY_SUMMARY, { netBb: 4, playerBluffShown: true, playerAllIn: false }),
      ['tease', 'tease'],
    );
    const later = withSignals(
      withHand(first, { netBb: -10, playerBluffShown: false, playerAllIn: true }),
      ['tease', 'compliment'],
    );
    expect(since(later, first)).toEqual({
      hands: 1,
      netBb: -10,
      playerBluffsShown: 0,
      playerAllIns: 1,
      signals: { tease: 1, compliment: 1 },
    });
    expect(since(first, EMPTY_SUMMARY)).toEqual(first);
    expect(since(first, first)).toEqual(EMPTY_SUMMARY);
  });
});
