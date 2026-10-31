import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CALM } from './mood.ts';
import type { Mood } from './mood.ts';
import { NEUTRAL_STYLE, styleOf } from './style.ts';

const axis = fc.double({ min: -1, max: 1, noNaN: true });

describe('styleOf', () => {
  it('is exactly neutral when calm', () => {
    expect(styleOf(CALM)).toEqual(NEUTRAL_STYLE);
    expect(NEUTRAL_STYLE).toEqual({ aggression: 1, bluff: 1, tightness: 1 });
  });

  it('follows the formulas inside the clamps', () => {
    const mood: Mood = { cheer: 0.2, confidence: 0.1, tilt: 0.2, caution: 0.3, form: 0.1 };
    const style = styleOf(mood);
    expect(style.aggression).toBeCloseTo(1 + 0.5 * 0.2 + 0.1 * (0.1 + 0.1), 12);
    expect(style.bluff).toBeCloseTo(1 + 0.8 * 0.2, 12);
    expect(style.tightness).toBeCloseTo(1 + 0.2 * 0.3 - 0.1 * 0.2, 12);
  });

  it('clamps at the corners', () => {
    expect(styleOf({ cheer: -1, confidence: 1, tilt: 1, caution: 1, form: 1 })).toEqual({
      aggression: 1.6,
      bluff: 1.8,
      tightness: 1.2,
    });
    expect(styleOf({ cheer: 1, confidence: -1, tilt: -1, caution: -1, form: -1 })).toEqual({
      aggression: 0.8,
      bluff: 0.8,
      tightness: 0.85,
    });
  });

  it('stays inside the clamps for any mood', () => {
    fc.assert(
      fc.property(axis, axis, axis, axis, axis, (cheer, confidence, tilt, caution, form) => {
        const style = styleOf({ cheer, confidence, tilt, caution, form });
        expect(style.aggression).toBeGreaterThanOrEqual(0.8);
        expect(style.aggression).toBeLessThanOrEqual(1.6);
        expect(style.bluff).toBeGreaterThanOrEqual(0.8);
        expect(style.bluff).toBeLessThanOrEqual(1.8);
        expect(style.tightness).toBeGreaterThanOrEqual(0.85);
        expect(style.tightness).toBeLessThanOrEqual(1.2);
      }),
    );
  });
});
