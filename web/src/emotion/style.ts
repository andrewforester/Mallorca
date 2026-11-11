import { BIAS_KEYS } from './biasKeys.ts';
import type { BiasKey, PlayBias } from './biasKeys.ts';
import type { BigFive } from './personality.ts';

const weights = ([o, c, e, a, n]: readonly [number, number, number, number, number]): BigFive => ({
  openness: o,
  conscientiousness: c,
  extraversion: e,
  agreeableness: a,
  neuroticism: n,
});

export const STYLE_WEIGHTS: Readonly<Record<BiasKey, Readonly<BigFive>>> = {
  aggression: weights([0.05, 0, 1, -0.15, -0.25]),
  looseness: weights([1, -0.2, 0.15, 0, 0.1]),
  bluff: weights([0.15, -0.2, 0, -1, -0.1]),
  stickiness: weights([0.15, -0.1, 0, -0.2, -1]),
  sizing: weights([0.05, -1, 0.2, -0.2, -0.15]),
};

const TRAITS = Object.keys(STYLE_WEIGHTS.aggression) as (keyof BigFive)[];

export const STYLE_SHARE = 0.7;
export const EXTREME_TRAIT = 0.8;

const NATURE_SCALE = Math.atanh(STYLE_SHARE);

const byAxis = (value: (key: BiasKey) => number): Record<BiasKey, number> =>
  Object.fromEntries(BIAS_KEYS.map((k) => [k, value(k)])) as Record<BiasKey, number>;

export function natureOf(bigFive: BigFive): Record<BiasKey, number> {
  return byAxis((key) => {
    let sum = 0;
    let lead = 0;
    for (const t of TRAITS) {
      sum += STYLE_WEIGHTS[key][t] * bigFive[t];
      lead = Math.max(lead, Math.abs(STYLE_WEIGHTS[key][t]));
    }
    return sum / (EXTREME_TRAIT * lead);
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
