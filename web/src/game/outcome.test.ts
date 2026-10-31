import { describe, expect, it } from 'vitest';
import type { Hand } from '../engine/index.ts';
import { actedLabel, isOpeningBet, openingEntries } from './outcome.ts';

function handWith(bets: [number, number]): Hand {
  return { bets } as Hand;
}

describe('isOpeningBet', () => {
  it('is false for a preflop raise over the blinds', () => {
    expect(isOpeningBet(handWith([10, 20]), { kind: 'raise', to: 60 })).toBe(false);
  });

  it('is true for a flop raise with no bets', () => {
    expect(isOpeningBet(handWith([0, 0]), { kind: 'raise', to: 40 })).toBe(true);
  });

  it('is false for a flop raise after a bet', () => {
    expect(isOpeningBet(handWith([0, 40]), { kind: 'raise', to: 120 })).toBe(false);
  });

  it('is false for a call', () => {
    expect(isOpeningBet(handWith([0, 0]), { kind: 'call' })).toBe(false);
  });
});

describe('actedLabel', () => {
  const raise = { type: 'acted', seat: 0, action: { kind: 'raise', to: 80 }, amount: 80 } as const;

  it('labels an opening raise as bet', () => {
    expect(actedLabel({ ...raise, allIn: false }, true)).toEqual({
      key: 'bet',
      params: { amount: 80 },
    });
  });

  it('keeps raiseTo when it does not open', () => {
    expect(actedLabel({ ...raise, allIn: false }, false)).toEqual({
      key: 'raiseTo',
      params: { amount: 80 },
    });
  });

  it('keeps allIn for an all-in opening bet', () => {
    expect(actedLabel({ ...raise, allIn: true }, true)).toEqual({ key: 'allIn', params: {} });
  });
});

describe('openingEntries', () => {
  it('turns the raise entry into a bet entry', () => {
    const entries = [{ key: 'raise', params: { seat: 1, amount: 80 } }];
    expect(openingEntries(entries, true)).toEqual([
      { key: 'bet', params: { seat: 1, amount: 80 } },
    ]);
    expect(openingEntries(entries, false)).toEqual(entries);
  });
});
