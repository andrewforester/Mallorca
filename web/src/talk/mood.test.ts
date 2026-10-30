import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CALM, SIGNALS, afterHand, afterSignals, moodWords, speakFactor } from './mood.ts';
import type { Mood, Outcome, Signal } from './mood.ts';

const quiet: Outcome = { netBb: 0, luckBb: null, bluffCaught: false };

describe('afterSignals', () => {
  const cases: Array<[Signal, Partial<Mood>]> = [
    ['tease', { tilt: 0.2 }],
    ['compliment', { cheer: 0.1, tilt: -0.1 }],
    ['claimStrength', { caution: 0.15 }],
    ['claimWeakness', { caution: -0.1 }],
    ['mockBluff', { tilt: 0.3 }],
    ['friendly', { cheer: 0.1 }],
  ];

  it.each(cases)('%s moves the axes by the spec value', (signal, delta) => {
    const next = afterSignals(CALM, [signal]);
    expect(next).toEqual({ ...CALM, ...delta });
  });

  it('applies several signals in order', () => {
    expect(afterSignals(CALM, ['tease', 'tease']).tilt).toBeCloseTo(0.4, 12);
  });
});

describe('afterHand', () => {
  it('decays the fast axes by 0.7 per neutral hand', () => {
    const hot: Mood = { cheer: 0.5, confidence: -0.5, tilt: 0.8, caution: 0.4, form: 0 };
    let mood = hot;
    for (let i = 0; i < 3; i++) {
      mood = afterHand(mood, quiet);
    }
    const factor = 0.7 ** 3;
    expect(mood.tilt).toBeCloseTo(0.8 * factor, 12);
    expect(mood.cheer).toBeCloseTo(0.5 * factor, 12);
    expect(mood.confidence).toBeCloseTo(-0.5 * factor, 12);
    expect(mood.caution).toBeCloseTo(0.4 * factor, 12);
  });

  it('rewards a big win and punishes a big loss', () => {
    const won = afterHand(CALM, { ...quiet, netBb: 12 });
    expect(won.confidence).toBeCloseTo(0.15, 12);
    expect(won.cheer).toBeCloseTo(0.1, 12);
    const lost = afterHand(CALM, { ...quiet, netBb: -12 });
    expect(lost.confidence).toBeCloseTo(-0.15, 12);
    expect(lost.cheer).toBeCloseTo(-0.1, 12);
  });

  it('adds tilt 0.3 and removes cheer 0.2 for a bad beat of 15 bb', () => {
    const next = afterHand(CALM, { ...quiet, luckBb: -15 });
    expect(next.tilt).toBeCloseTo(0.3, 12);
    expect(next.cheer).toBeCloseTo(-0.2, 12);
  });

  it('adds no tilt when luck is unknown', () => {
    expect(afterHand(CALM, { ...quiet, netBb: -15, luckBb: null }).tilt).toBe(0);
  });

  it('adds tilt 0.2 and removes confidence 0.2 for a caught bluff', () => {
    const next = afterHand(CALM, { ...quiet, bluffCaught: true });
    expect(next.tilt).toBeCloseTo(0.2, 12);
    expect(next.confidence).toBeCloseTo(-0.2, 12);
  });

  it('changes only form after a small preflop fold', () => {
    const next = afterHand(CALM, { ...quiet, netBb: -0.5 });
    expect(next).toEqual({ ...CALM, form: 0.05 * (-0.5 / 10) });
  });

  it('keeps form as an exponential mean', () => {
    const next = afterHand({ ...CALM, form: 0.4 }, { ...quiet, netBb: 20 });
    expect(next.form).toBeCloseTo(0.95 * 0.4 + 0.05 * 2, 12);
  });
});

describe('moodWords', () => {
  it('is empty when calm', () => {
    expect(moodWords(CALM)).toEqual([]);
  });

  it('describes the strongest axes first, at most three', () => {
    const mood: Mood = { cheer: 0.3, confidence: -0.4, tilt: 0.9, caution: 0.5, form: 0.6 };
    expect(moodWords(mood)).toEqual(['annoyed', 'on a winning streak', 'cautious']);
  });

  it('uses the negative vocabulary', () => {
    expect(moodWords({ ...CALM, cheer: -0.5 })).toEqual(['glum']);
    expect(moodWords({ ...CALM, confidence: -0.5 })).toEqual(['unsure of herself']);
    expect(moodWords({ ...CALM, form: -0.5 })).toEqual(['on a losing streak']);
  });

  it('ignores values under the threshold', () => {
    expect(moodWords({ ...CALM, tilt: 0.2 })).toEqual([]);
  });
});

describe('speakFactor', () => {
  it('is 1 when calm', () => {
    expect(speakFactor(CALM)).toBe(1);
  });

  it('rises with cheer and tilt and falls with low cheer', () => {
    expect(speakFactor({ ...CALM, cheer: 1, tilt: 1 })).toBe(1.25);
    expect(speakFactor({ ...CALM, cheer: -1 })).toBeLessThan(1);
  });
});

describe('mood invariants', () => {
  const outcome = fc.record({
    netBb: fc.double({ min: -400, max: 400, noNaN: true }),
    luckBb: fc.option(fc.double({ min: -400, max: 400, noNaN: true }), { nil: null }),
    bluffCaught: fc.boolean(),
  });
  const step = fc.oneof(
    outcome.map((o) => ({ kind: 'hand' as const, o })),
    fc
      .array(fc.constantFrom(...SIGNALS), { maxLength: 4 })
      .map((s) => ({ kind: 'say' as const, s })),
  );

  it('keeps every axis in [-1, 1] and speakFactor in range', () => {
    fc.assert(
      fc.property(fc.array(step, { maxLength: 60 }), (steps) => {
        let mood = CALM;
        for (const item of steps) {
          mood = item.kind === 'hand' ? afterHand(mood, item.o) : afterSignals(mood, item.s);
          for (const value of Object.values(mood)) {
            expect(Math.abs(value)).toBeLessThanOrEqual(1);
          }
          expect(speakFactor(mood)).toBeGreaterThanOrEqual(0.75);
          expect(speakFactor(mood)).toBeLessThanOrEqual(1.25);
        }
      }),
    );
  });
});
