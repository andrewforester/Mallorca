import { saturate } from './emotions.ts';
import type { Emotions, Pad } from './emotions.ts';
import type { Traits } from './personality.ts';

export const LOAD_SOURCES = [
  'anger',
  'injustice',
  'shame',
  'distress',
  'disappointment',
  'fear',
  'mood',
  'desperation',
] as const;
export type LoadSource = (typeof LOAD_SOURCES)[number];
export type LoadParts = Readonly<Record<LoadSource, number>>;

export const LOAD_WEIGHT: Readonly<Record<Exclude<LoadSource, 'mood' | 'desperation'>, number>> = {
  anger: 1,
  injustice: 1,
  shame: 0.8,
  distress: 0.4,
  disappointment: 0.3,
  fear: 0.2,
};

export const MOOD_WEIGHT = 0.5;
export const DESPERATION_FREE_BB = 40;
export const DESPERATION_BB = 160;
export const LEAK_FLOOR = 0.3;
export const OVERLOAD_WIDTH = 0.15;

export interface LoadReading {
  parts: LoadParts;
  load: number;
  overload: number;
  leakage: number;
  dominant: LoadSource | null;
}

export const desperationOf = (sessionNetBb: number): number =>
  saturate(Math.max(0, -sessionNetBb - DESPERATION_FREE_BB) / DESPERATION_BB);

export function loadOf(
  e: Emotions,
  moodShift: Pad,
  sessionNetBb: number,
  traits: Traits,
): LoadReading {
  const parts: Record<LoadSource, number> = {
    anger: LOAD_WEIGHT.anger * e.anger,
    injustice: LOAD_WEIGHT.injustice * e.injustice,
    shame: LOAD_WEIGHT.shame * e.shame,
    distress: LOAD_WEIGHT.distress * e.distress,
    disappointment: LOAD_WEIGHT.disappointment * e.disappointment,
    fear: LOAD_WEIGHT.fear * e.fear,
    mood: MOOD_WEIGHT * Math.max(0, -moodShift[0]),
    desperation: desperationOf(sessionNetBb),
  };
  const load = Object.values(parts).reduce((a, b) => a + b, 0);
  const overload = 1 / (1 + Math.exp(-(load - traits.composure) / OVERLOAD_WIDTH));
  const dominant =
    load > 0 ? LOAD_SOURCES.reduce((best, k) => (parts[k] > parts[best] ? k : best)) : null;
  return {
    parts,
    load,
    overload,
    leakage: (1 - traits.discipline) * (LEAK_FLOOR + (1 - LEAK_FLOOR) * overload),
    dominant,
  };
}
