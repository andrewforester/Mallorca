import { describe, expect, it } from 'vitest';
import { describeEvent } from './events.ts';

describe('her own moves in the journal', () => {
  it('names her bet and her fold with her equity', () => {
    expect(describeEvent({ kind: 'ownMove', move: 'bet', amountBb: 20, equity: 0.2 })).toBe(
      'She bets 20.0 bb, equity 20%',
    );
    expect(describeEvent({ kind: 'ownMove', move: 'fold', facingBb: 30, equity: 0.75 })).toBe(
      'She folds to 30.0 bb, equity 75%',
    );
  });
});
