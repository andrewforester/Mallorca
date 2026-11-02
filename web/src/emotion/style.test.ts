import { describe, expect, it } from 'vitest';
import { BIAS_KEYS } from './biasKeys.ts';
import type { BigFive } from './personality.ts';
import { PERSONALITIES } from './profiles.ts';
import { STYLE_COEFFICIENTS, styleOf } from './style.ts';

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

describe('styleOf', () => {
  it('gives a neutral character the blueprint at any experience', () => {
    for (const experience of [0, 0.5]) {
      expect(rounded(styleOf(NEUTRAL, experience))).toEqual([1, 1, 1, 1, 1]);
    }
  });

  it('pulls every profile fully to the blueprint at experience 1', () => {
    for (const p of Object.values(PERSONALITIES)) {
      expect(rounded(styleOf(p.bigFive, 1))).toEqual([1, 1, 1, 1, 1]);
    }
  });

  it('gives a single trait at full strength the exponent of its coefficient for a novice', () => {
    for (const trait of TRAITS) {
      const style = styleOf({ ...NEUTRAL, [trait]: 1 }, 0);
      for (const key of BIAS_KEYS) {
        expect(style[key]).toBeCloseTo(Math.exp(STYLE_COEFFICIENTS[key][trait]), 9);
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

  it('gives the profiles the styles of the spec', () => {
    const style = (k: keyof typeof PERSONALITIES) =>
      rounded(styleOf(PERSONALITIES[k].bigFive, PERSONALITIES[k].experience));
    expect(style('mallorca')).toEqual([1.01, 1.04, 1, 1, 1.05]);
    expect(style('mira')).toEqual([1.01, 1.02, 1.01, 1, 1.03]);
    expect(style('ingrid')).toEqual([0.99, 0.96, 1, 1.01, 0.96]);
    expect(style('lola')).toEqual([1.17, 1.49, 1.09, 1.02, 1.47]);
    expect(style('nina')).toEqual([0.67, 0.96, 0.65, 0.79, 1.25]);
  });
});
