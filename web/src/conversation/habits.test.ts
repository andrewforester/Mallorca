import { describe, expect, it } from 'vitest';
import { BASE_HABITS, habitsAt } from './habits.ts';
import type { Situation } from './habits.ts';
import type { StrengthClass } from '../persona/index.ts';

const CLASSES: StrengthClass[] = ['strong', 'medium', 'weak'];
const SITUATIONS = Object.keys(BASE_HABITS) as Situation[];

const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);

describe('habitsAt', () => {
  it('keeps the base profile without a mask', () => {
    expect(habitsAt(BASE_HABITS, 0)).toEqual(BASE_HABITS);
  });

  it('narrows speak to a tenth of the spread behind a mask of 0.9', () => {
    const masked = habitsAt(BASE_HABITS, 0.9);
    for (const situation of SITUATIONS) {
      const base = CLASSES.map((c) => BASE_HABITS[situation][c].speak);
      const moved = CLASSES.map((c) => masked[situation][c].speak);
      expect(spread(moved)).toBeLessThanOrEqual(0.1 * spread(base) + 1e-12);
    }
  });

  it('moves every value exactly halfway behind a mask of 0.5', () => {
    const half = habitsAt(BASE_HABITS, 0.5);
    for (const situation of SITUATIONS) {
      const neutral =
        CLASSES.reduce((sum, c) => sum + BASE_HABITS[situation][c].speak, 0) / CLASSES.length;
      for (const c of CLASSES) {
        const base = BASE_HABITS[situation][c];
        expect(half[situation][c].speak).toBeCloseTo((base.speak + neutral) / 2, 12);
      }
    }
  });

  it('holds the spec values for the base profile', () => {
    expect(BASE_HABITS.herBet.weak).toEqual({ speak: 0.6 });
    expect(BASE_HABITS.playerBet.strong).toEqual({ speak: 0.4 });
    expect(BASE_HABITS.herCall.medium).toEqual({ speak: 0.2 });
    expect(BASE_HABITS.bluffCaught.weak).toEqual({ speak: 0.9 });
    expect(BASE_HABITS.handWon.strong).toEqual({ speak: 0.5 });
    expect(BASE_HABITS.handLost.weak).toEqual({ speak: 0.4 });
  });
});
