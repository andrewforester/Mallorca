import { describe, expect, it } from 'vitest';
import { BASE_HABITS, habitsAt } from './habits.ts';
import type { Situation } from './habits.ts';
import type { StrengthClass } from './strength.ts';

const CLASSES: StrengthClass[] = ['strong', 'medium', 'weak'];
const SITUATIONS = Object.keys(BASE_HABITS) as Situation[];

const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);

describe('habitsAt', () => {
  it('keeps the base profile on obvious', () => {
    expect(habitsAt(BASE_HABITS, 'obvious')).toEqual(BASE_HABITS);
  });

  it('narrows speak to a tenth of the spread and honest to 0.5 on hidden', () => {
    const hidden = habitsAt(BASE_HABITS, 'hidden');
    for (const situation of SITUATIONS) {
      const base = CLASSES.map((c) => BASE_HABITS[situation][c].speak);
      const moved = CLASSES.map((c) => hidden[situation][c].speak);
      expect(spread(moved)).toBeLessThanOrEqual(0.1 * spread(base) + 1e-12);
      for (const c of CLASSES) {
        expect(Math.abs(hidden[situation][c].honest - 0.5)).toBeLessThanOrEqual(0.05 + 1e-12);
      }
    }
  });

  it('moves every value exactly halfway on subtle', () => {
    const subtle = habitsAt(BASE_HABITS, 'subtle');
    for (const situation of SITUATIONS) {
      const neutral =
        CLASSES.reduce((sum, c) => sum + BASE_HABITS[situation][c].speak, 0) / CLASSES.length;
      for (const c of CLASSES) {
        const base = BASE_HABITS[situation][c];
        expect(subtle[situation][c].speak).toBeCloseTo((base.speak + neutral) / 2, 12);
        expect(subtle[situation][c].honest).toBeCloseTo((base.honest + 0.5) / 2, 12);
      }
    }
  });

  it('holds the spec values for the base profile', () => {
    expect(BASE_HABITS.herBet.weak).toEqual({ speak: 0.6, honest: 0.2 });
    expect(BASE_HABITS.playerBet.strong).toEqual({ speak: 0.4, honest: 0.2 });
    expect(BASE_HABITS.herCall.medium).toEqual({ speak: 0.2, honest: 0.5 });
    expect(BASE_HABITS.bluffCaught.weak).toEqual({ speak: 0.9, honest: 0.5 });
    expect(BASE_HABITS.handWon.strong).toEqual({ speak: 0.5, honest: 0.5 });
    expect(BASE_HABITS.handLost.weak).toEqual({ speak: 0.4, honest: 0.5 });
  });
});
