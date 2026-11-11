import { BIAS_KEYS } from './biasKeys.ts';
import type { BiasKey, PlayBias } from './biasKeys.ts';
import { APPROACH, CERTAINTY, EMOTIONS, EMOTION_PAD, NEGATIVE, clamp01 } from './emotions.ts';
import type { Emotion, Emotions, Pad } from './emotions.ts';
import type { Traits } from './personality.ts';
import { styleFrom } from './style.ts';

export const MOOD_WEIGHT = 2;
export const PUSH_GAIN = 2;
export const URGENCY_PUSH = 0.8;

export type Affect = readonly [number, number, number, number];

export const PLAY_AXES: Readonly<Record<BiasKey, Affect>> = {
  aggression: [0.1, 0.3, 1, 0],
  looseness: [-0.5, -0.3, 0.2, 0.6],
  bluff: [0, 0.2, 0.6, 0.6],
  sizing: [0, 0.4, 0.5, 0.5],
  stickiness: [0.3, 0.2, 0.8, 0],
};

export interface MoodShift {
  shift: Pad;
  approach: number;
  certainty: number;
}

export type Part = Emotion | 'mood';

export interface LoadReading {
  intensity: number;
  strain: number;
  overload: number;
  reach: number;
  composure: number;
  discipline: number;
  parts: [Part, number][];
}

export interface PlayReading {
  intensity: number;
  gate: number;
  reach: number;
  bias: PlayBias;
}

const axesOf = (e: Emotion): Affect => [
  EMOTION_PAD[e][0],
  EMOTION_PAD[e][1],
  APPROACH[e],
  CERTAINTY[e],
];
const lengthOf = (a: Affect): number => Math.hypot(a[0], a[1], a[2]);
const dot = (a: Affect, b: Affect): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const moodPart = (m: MoodShift): Affect => [
  MOOD_WEIGHT * m.shift[0],
  MOOD_WEIGHT * m.shift[1],
  MOOD_WEIGHT * m.approach,
  MOOD_WEIGHT * m.certainty,
];

export function affectOf(e: Emotions, mood: MoodShift, urgency: number): Affect {
  const sum = [...moodPart(mood)];
  for (const name of EMOTIONS) {
    const axes = axesOf(name);
    for (let i = 0; i < 4; i++) {
      sum[i] = (sum[i] ?? 0) + e[name] * (axes[i] ?? 0);
    }
  }
  const [p = 0, a = 0, ap = 0, c = 0] = sum;
  return [p, a, ap + URGENCY_PUSH * urgency * Math.max(0, a), c];
}

export function partsOf(e: Emotions, mood: MoodShift): [Part, number][] {
  const parts: [Part, number][] = EMOTIONS.map((name) => [name, e[name] * lengthOf(axesOf(name))]);
  parts.push(['mood', lengthOf(moodPart(mood))]);
  return parts;
}

const unpleasantness = (shift: Pad): number => {
  const length = Math.hypot(shift[0], shift[1], shift[2]);
  return length === 0 ? 0 : clamp01(-shift[0] / length);
};

export function strainOf(e: Emotions, mood: MoodShift): number {
  const share = unpleasantness(mood.shift);
  const sum = moodPart(mood).map((v) => v * share);
  for (const name of NEGATIVE) {
    const axes = axesOf(name);
    for (let i = 0; i < 3; i++) {
      sum[i] = (sum[i] ?? 0) + e[name] * (axes[i] ?? 0);
    }
  }
  const [p = 0, a = 0, ap = 0] = sum;
  return Math.hypot(p, a, ap);
}

const thresholdOf = (x: number, composure: number): number => {
  const squared = x * x;
  return squared === 0 ? 0 : squared / (squared + composure ** 2);
};

export const overloadOf = thresholdOf;

export function pushOf(affect: Affect, reach: number, intensity: number): Record<BiasKey, number> {
  return Object.fromEntries(
    BIAS_KEYS.map((k) => [
      k,
      intensity === 0 ? 0 : (PUSH_GAIN * reach * dot(PLAY_AXES[k], affect)) / intensity,
    ]),
  ) as Record<BiasKey, number>;
}

export function playOf(affect: Affect, traits: Traits): PlayReading {
  const intensity = lengthOf(affect);
  const gate = thresholdOf(intensity, traits.composure);
  const reach = (1 - traits.discipline) * gate;
  const bias = styleFrom(traits.nature, pushOf(affect, reach, intensity));
  return { intensity, gate, reach, bias };
}
