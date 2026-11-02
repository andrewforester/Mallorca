import { describe, expect, it } from 'vitest';
import { spotOdds } from './odds.ts';

describe('spotOdds', () => {
  it('gives the price, the defence frequency and the bluff share of a bet', () => {
    const odds = spotOdds(50, 150);
    expect(odds?.toCall).toBe(50);
    expect(odds?.requiredEquity).toBeCloseTo(0.25, 10);
    expect(odds?.mdf).toBeCloseTo(2 / 3, 10);
    expect(odds?.bluffShare).toBeCloseTo(0.25, 10);
  });

  it('is null when nothing is to call', () => {
    expect(spotOdds(0, 100)).toBeNull();
  });
});
