import { BIAS_KEYS } from './biasKeys.ts';
import type { BiasKey, PlayBias } from './biasKeys.ts';
import { APPROACH, EMOTIONS, EMOTION_PAD } from './emotions.ts';
import type { Emotion, Emotions, Pad } from './emotions.ts';
import type { Traits } from './personality.ts';
import { styleFrom } from './style.ts';

export const MOOD_WEIGHT = 2;
export const PUSH_GAIN = 2;
export const URGENCY_PUSH = 0.8;

export const PLAY_AXES: Readonly<Record<BiasKey, Pad>> = {
  aggression: [0.1, 0.3, 1],
  looseness: [0.4, 0.3, 0.5],
  bluff: [0, 0.5, 0.9],
  sizing: [0, 0.6, 0.6],
  stickiness: [0.3, 0.2, 0.8],
};

export type Part = Emotion | 'mood';

export interface LoadReading {
  intensity: number;
  overload: number;
  reach: number;
  composure: number;
  discipline: number;
  parts: [Part, number][];
}

export interface PlayReading {
  intensity: number;
  overload: number;
  reach: number;
  bias: PlayBias;
}

const axesOf = (e: Emotion): Pad => [EMOTION_PAD[e][0], EMOTION_PAD[e][1], APPROACH[e]];
const lengthOf = (a: Pad): number => Math.hypot(a[0], a[1], a[2]);
const dot = (a: Pad, b: Pad): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const moodPart = (shift: Pad, approach: number): Pad => [
  MOOD_WEIGHT * shift[0],
  MOOD_WEIGHT * shift[1],
  MOOD_WEIGHT * approach,
];

export function affectOf(e: Emotions, moodShift: Pad, approach: number, urgency: number): Pad {
  const sum = [...moodPart(moodShift, approach)];
  for (const name of EMOTIONS) {
    const axes = axesOf(name);
    for (let i = 0; i < 3; i++) {
      sum[i] = (sum[i] ?? 0) + e[name] * (axes[i] ?? 0);
    }
  }
  const [p = 0, a = 0, ap = 0] = sum;
  return [p, a, ap + URGENCY_PUSH * urgency * Math.max(0, a)];
}

export function partsOf(e: Emotions, moodShift: Pad, approach: number): [Part, number][] {
  const parts: [Part, number][] = EMOTIONS.map((name) => [name, e[name] * lengthOf(axesOf(name))]);
  parts.push(['mood', lengthOf(moodPart(moodShift, approach))]);
  return parts;
}

export function playOf(affect: Pad, traits: Traits): PlayReading {
  const intensity = lengthOf(affect);
  const squared = intensity * intensity;
  const overload = squared === 0 ? 0 : squared / (squared + traits.composure ** 2);
  const reach = (1 - traits.discipline) * overload;
  const push = Object.fromEntries(
    BIAS_KEYS.map((k) => [
      k,
      intensity === 0 ? 0 : (PUSH_GAIN * reach * dot(PLAY_AXES[k], affect)) / intensity,
    ]),
  ) as Record<BiasKey, number>;
  return { intensity, overload, reach, bias: styleFrom(traits.nature, push) };
}
