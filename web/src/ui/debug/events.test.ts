import { describe, expect, it } from 'vitest';
import { describeEvent } from './events.ts';

describe('the journal of her feeling', () => {
  it('names her bet with the pot and her equity', () => {
    expect(
      describeEvent({ kind: 'ownMove', move: 'bet', amountBb: 15, potBb: 20, equity: 0.2 }),
    ).toBe('She bets 15.0 bb into 20.0 bb, equity 20%');
  });

  it('names his call and who decided the hand', () => {
    expect(describeEvent({ kind: 'opponentCall' })).toBe('Player calls');
    expect(describeEvent({ kind: 'result', netBb: 20, decided: 'heFolded' })).toBe(
      'Hand over, he folded, +20.0 bb',
    );
    expect(describeEvent({ kind: 'result', netBb: -2, decided: 'sheFolded' })).toBe(
      'Hand over, she folded, -2.0 bb',
    );
    expect(describeEvent({ kind: 'result', netBb: -15, decided: 'showdown' })).toBe(
      'Hand over, showdown, -15.0 bb',
    );
  });
});
