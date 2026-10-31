import { describe, expect, it } from 'vitest';
import type { CoachMove } from './moves.ts';
import { chosenMove, grade, reviewDecision } from './review.ts';

const moves: CoachMove[] = [
  { label: 'fold', amount: 0, tone: 'fold' },
  { label: 'call', amount: 10, tone: 'passive' },
  { label: 'raise', amount: 50, tone: 'small' },
  { label: 'raise', amount: 100, tone: 'large' },
  { label: 'allIn', amount: 2000, tone: 'allIn' },
];

describe('grade', () => {
  it('splits at 25 and 5 percent', () => {
    expect(grade(0.25)).toBe('strategy');
    expect(grade(0.249)).toBe('rare');
    expect(grade(0.05)).toBe('rare');
    expect(grade(0.049)).toBe('off');
  });
});

describe('chosenMove', () => {
  it('finds the move of the action', () => {
    expect(chosenMove({ kind: 'fold' }, moves)).toBe(0);
    expect(chosenMove({ kind: 'call' }, moves)).toBe(1);
    expect(chosenMove({ kind: 'check' }, moves)).toBeNull();
  });

  it('maps a raise to the nearest sized move', () => {
    expect(chosenMove({ kind: 'raise', to: 70 }, moves)).toBe(2);
    expect(chosenMove({ kind: 'raise', to: 90 }, moves)).toBe(3);
    expect(chosenMove({ kind: 'raise', to: 1900 }, moves)).toBe(4);
  });
});

describe('reviewDecision', () => {
  it('grades the action by the strategy share of its move', () => {
    const hint = { moves, mine: [0.02, 0.5, 0.3, 0.1, 0.08], approximate: false, heroCell: 0 };
    const decision = reviewDecision(hint, { kind: 'fold' }, 'preflop', 'threeBet');
    expect(decision).toMatchObject({ chosen: 0, frequency: 0.02, grade: 'off', spot: 'threeBet' });
    expect(reviewDecision(hint, { kind: 'check' }, 'flop', null)).toMatchObject({
      chosen: null,
      frequency: null,
      grade: null,
    });
  });
});
