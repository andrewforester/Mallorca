import { describe, expect, it } from 'vitest';
import { BIAS_KEYS } from './biasKeys.ts';
import type { BiasKey } from './biasKeys.ts';
import type { BigFive } from './personality.ts';
import { MALLORCA } from './profiles.ts';
import { STYLE_COEFFICIENTS, STYLE_SHARE, natureOf, styleFrom, styleOf } from './style.ts';

const NEUTRAL: BigFive = {
  openness: 0,
  conscientiousness: 0,
  extraversion: 0,
  agreeableness: 0,
  neuroticism: 0,
};

const TRAITS = Object.keys(NEUTRAL) as (keyof BigFive)[];

const rounded = (b: ReturnType<typeof styleOf>): number[] =>
  BIAS_KEYS.map((k) => Math.round(b[k] * 100) / 100);

const allAxes = (v: number): Record<BiasKey, number> =>
  Object.fromEntries(BIAS_KEYS.map((k) => [k, v])) as Record<BiasKey, number>;

const signedProfile = (key: BiasKey, sign: number): BigFive =>
  Object.fromEntries(
    TRAITS.map((t) => [t, sign * Math.sign(STYLE_COEFFICIENTS[key][t])]),
  ) as unknown as BigFive;

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe('natureOf', () => {
  it('is zero on every axis for an average character', () => {
    expect(Object.values(natureOf(NEUTRAL))).toEqual([0, 0, 0, 0, 0]);
  });

  it('is one on an axis when every trait has the sign of its coefficient', () => {
    expect(natureOf(signedProfile('aggression', 1)).aggression).toBeCloseTo(1, 12);
    expect(natureOf(signedProfile('aggression', -1)).aggression).toBeCloseTo(-1, 12);
  });
});

describe('styleOf', () => {
  it('gives an average character the blueprint', () => {
    expect(rounded(styleOf(NEUTRAL))).toEqual([1, 1, 1, 1, 1]);
  });

  it('takes the most extreme character to eighty percent of the log range', () => {
    expect(STYLE_SHARE).toBe(0.8);
    expect(styleOf(signedProfile('aggression', 1)).aggression).toBeCloseTo(2 ** 0.8, 9);
    expect(styleOf(signedProfile('aggression', -1)).aggression).toBeCloseTo(2 ** -0.8, 9);
  });

  it('gives Mallorca the reference style at rest', () => {
    expect(rounded(styleOf(MALLORCA.bigFive))).toEqual([1.02, 1.12, 1, 0.98, 1.15]);
  });

  it('keeps every random character strictly inside the range', () => {
    const next = lcg(7);
    for (let i = 0; i < 200; i++) {
      const b = Object.fromEntries(TRAITS.map((t) => [t, 2 * next() - 1])) as unknown as BigFive;
      for (const v of Object.values(styleOf(b))) {
        expect(v).toBeGreaterThan(0.5);
        expect(v).toBeLessThan(2);
      }
    }
  });

  it('follows the signs of the table', () => {
    expect(STYLE_COEFFICIENTS.aggression).toEqual({
      openness: 0.15,
      conscientiousness: -0.15,
      extraversion: 0.3,
      agreeableness: -0.2,
      neuroticism: -0.25,
    });
    expect(STYLE_COEFFICIENTS.looseness).toEqual({
      openness: 0.25,
      conscientiousness: -0.3,
      extraversion: 0.2,
      agreeableness: 0,
      neuroticism: 0.1,
    });
    expect(STYLE_COEFFICIENTS.bluff).toEqual({
      openness: 0.2,
      conscientiousness: -0.1,
      extraversion: 0.25,
      agreeableness: -0.25,
      neuroticism: -0.3,
    });
    expect(STYLE_COEFFICIENTS.sizing).toEqual({
      openness: 0.1,
      conscientiousness: 0,
      extraversion: 0.15,
      agreeableness: -0.2,
      neuroticism: -0.15,
    });
    expect(STYLE_COEFFICIENTS.stickiness).toEqual({
      openness: 0.15,
      conscientiousness: -0.2,
      extraversion: 0.1,
      agreeableness: 0.15,
      neuroticism: 0.3,
    });
  });
});

describe('styleFrom', () => {
  it('approaches the edges without reaching them', () => {
    const up = styleFrom(allAxes(1), allAxes(5));
    const down = styleFrom(allAxes(-1), allAxes(-5));
    for (const k of BIAS_KEYS) {
      expect(up[k]).toBeLessThan(2);
      expect(up[k]).toBeGreaterThan(1.999);
      expect(down[k]).toBeGreaterThan(0.5);
    }
  });

  it('adds the push to the nature inside the tanh', () => {
    const style = styleFrom(allAxes(0.25), allAxes(0.3));
    expect(style.bluff).toBeCloseTo(2 ** Math.tanh(Math.atanh(0.8) * 0.25 + 0.3), 12);
  });
});
