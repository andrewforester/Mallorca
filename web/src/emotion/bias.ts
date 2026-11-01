import { clamp, clamp01 } from './emotions.ts';
import type { Emotions, Pad } from './emotions.ts';
import { desperationOf } from './load.ts';
import { BIAS_KEYS, NEUTRAL_PLAY_BIAS } from './biasKeys.ts';
import type { BiasKey, PlayBias } from './biasKeys.ts';

export { BIAS_KEYS, NEUTRAL_PLAY_BIAS } from './biasKeys.ts';
export type { BiasKey, PlayBias } from './biasKeys.ts';

export const DRIVERS = [
  'fear',
  'elation',
  'anger',
  'injustice',
  'shame',
  'sadness',
  'dominance',
  'desperation',
] as const;
export type Driver = (typeof DRIVERS)[number];
export type Drivers = Readonly<Record<Driver, number>>;

export const COEFFICIENTS: Readonly<Record<BiasKey, Readonly<Record<Driver, number>>>> = {
  aggression: {
    fear: -0.35,
    elation: 0.05,
    anger: 0.6,
    injustice: 0.4,
    shame: -0.3,
    sadness: -0.15,
    dominance: 0.2,
    desperation: 0.3,
  },
  looseness: {
    fear: -0.25,
    elation: 0.15,
    anger: 0.4,
    injustice: 0.5,
    shame: -0.3,
    sadness: 0.15,
    dominance: 0.05,
    desperation: 0.6,
  },
  bluff: {
    fear: -0.4,
    elation: 0.1,
    anger: 0.8,
    injustice: 0.5,
    shame: -0.4,
    sadness: -0.15,
    dominance: 0.15,
    desperation: 0.4,
  },
  sizing: {
    fear: -0.2,
    elation: 0,
    anger: 0.4,
    injustice: 0.3,
    shame: -0.2,
    sadness: -0.05,
    dominance: 0.15,
    desperation: 0.4,
  },
  stickiness: {
    fear: -0.35,
    elation: 0.1,
    anger: 0.3,
    injustice: 0.4,
    shame: -0.35,
    sadness: 0.3,
    dominance: 0.1,
    desperation: 0.5,
  },
};

export const BIAS_RANGE: readonly [number, number] = [0.5, 2];

export function driversOf(e: Emotions, moodShift: Pad, sessionNetBb: number): Drivers {
  return {
    fear: e.fear,
    elation: clamp01(e.joy + e.pride + 0.5 * e.relief),
    anger: e.anger,
    injustice: e.injustice,
    shame: e.shame,
    sadness: clamp01(e.distress + e.disappointment),
    dominance: moodShift[2],
    desperation: desperationOf(sessionNetBb),
  };
}

export function biasOf(
  drivers: Drivers,
  leakage: number,
  baseline: PlayBias = NEUTRAL_PLAY_BIAS,
): PlayBias {
  const value = (key: BiasKey): number => {
    let sum = 0;
    for (const d of DRIVERS) {
      sum += COEFFICIENTS[key][d] * drivers[d];
    }
    return clamp(baseline[key] * (1 + leakage * sum), BIAS_RANGE[0], BIAS_RANGE[1]);
  };
  return Object.fromEntries(BIAS_KEYS.map((k) => [k, value(k)])) as Record<BiasKey, number>;
}
