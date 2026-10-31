import { describe, expect, it } from 'vitest';
import type { Action } from '../engine/index.ts';
import { leaks } from './leaks.ts';
import type { CoachMove } from './moves.ts';
import type { CoachDecision } from './review.ts';
import type { SpotTag } from './spots.ts';

const moves: CoachMove[] = [
  { label: 'fold', amount: 0, tone: 'fold' },
  { label: 'call', amount: 10, tone: 'passive' },
  { label: 'raise', amount: 50, tone: 'small' },
];

function decision(spot: SpotTag | null, action: Action, raise: number): CoachDecision {
  return {
    street: 'preflop',
    action,
    moves,
    mine: [0, 1 - raise, raise],
    approximate: false,
    chosen: null,
    frequency: null,
    grade: null,
    spot,
  };
}

describe('leaks', () => {
  it('compares the player with the strategy in the same spots', () => {
    const result = leaks([
      decision('open', { kind: 'raise', to: 50 }, 0.8),
      decision('open', { kind: 'call' }, 0.6),
      decision(null, { kind: 'call' }, 0.6),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.spot).toBe('open');
    expect(result[0]?.spots).toBe(2);
    expect(result[0]?.player).toBeCloseTo(0.5, 10);
    expect(result[0]?.strategy).toBeCloseTo(0.7, 10);
  });

  it('counts folds for the folding spots and keeps a fixed order', () => {
    const facing = { ...decision('riverFold', { kind: 'fold' }, 0.2), mine: [0.4, 0.4, 0.2] };
    const result = leaks([facing, decision('open', { kind: 'call' }, 0.5)]);
    expect(result.map((leak) => leak.spot)).toEqual(['open', 'riverFold']);
    expect(result[1]?.player).toBe(1);
    expect(result[1]?.strategy).toBeCloseTo(0.4, 10);
  });
});
