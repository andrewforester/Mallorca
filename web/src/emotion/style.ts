import { BIAS_KEYS } from './biasKeys.ts';
import type { BiasKey, PlayBias } from './biasKeys.ts';
import type { BigFive } from './personality.ts';

export const STYLE_COEFFICIENTS: Readonly<Record<BiasKey, Readonly<BigFive>>> = {
  aggression: {
    openness: 0.15,
    conscientiousness: -0.15,
    extraversion: 0.3,
    agreeableness: -0.2,
    neuroticism: -0.25,
  },
  looseness: {
    openness: 0.25,
    conscientiousness: -0.3,
    extraversion: 0.2,
    agreeableness: 0,
    neuroticism: 0.1,
  },
  bluff: {
    openness: 0.2,
    conscientiousness: -0.1,
    extraversion: 0.25,
    agreeableness: -0.25,
    neuroticism: -0.3,
  },
  sizing: {
    openness: 0.1,
    conscientiousness: 0,
    extraversion: 0.15,
    agreeableness: -0.2,
    neuroticism: -0.15,
  },
  stickiness: {
    openness: 0.15,
    conscientiousness: -0.2,
    extraversion: 0.1,
    agreeableness: 0.15,
    neuroticism: 0.3,
  },
};

const TRAITS = Object.keys(STYLE_COEFFICIENTS.aggression) as (keyof BigFive)[];

export const STYLE_SHARE = 0.8;

const NATURE_SCALE = Math.atanh(STYLE_SHARE);

const byAxis = (value: (key: BiasKey) => number): Record<BiasKey, number> =>
  Object.fromEntries(BIAS_KEYS.map((k) => [k, value(k)])) as Record<BiasKey, number>;

export function natureOf(bigFive: BigFive): Record<BiasKey, number> {
  return byAxis((key) => {
    let sum = 0;
    let scale = 0;
    for (const t of TRAITS) {
      sum += STYLE_COEFFICIENTS[key][t] * bigFive[t];
      scale += Math.abs(STYLE_COEFFICIENTS[key][t]);
    }
    return sum / scale;
  });
}

export function styleFrom(
  nature: Readonly<Record<BiasKey, number>>,
  push: Readonly<Record<BiasKey, number>>,
): PlayBias {
  return byAxis((key) => 2 ** Math.tanh(NATURE_SCALE * nature[key] + push[key]));
}

const NO_PUSH = byAxis(() => 0);

export function styleOf(bigFive: BigFive): PlayBias {
  return styleFrom(natureOf(bigFive), NO_PUSH);
}
