import type { Emotion, Snapshot } from '../emotion/index.ts';
import type { Bias } from './bias.ts';

const WORD_THRESHOLD = 0.25;
const MAX_WORDS = 3;
const OVERLOADED = 0.6;
const SPEAK_GAIN = 0.25;

const WORDS: Readonly<Record<Emotion, string>> = {
  hope: 'hopeful',
  fear: 'nervous',
  joy: 'pleased',
  distress: 'upset',
  relief: 'relieved',
  disappointment: 'disappointed',
  pride: 'proud',
  shame: 'embarrassed',
  anger: 'annoyed',
  injustice: 'feeling robbed',
  surprise: 'surprised',
};

const clamp = (v: number, low: number, high: number): number => Math.max(low, Math.min(high, v));

export function wordsOf(s: Snapshot): string[] {
  const found = (Object.keys(WORDS) as Emotion[])
    .filter((e) => s.emotions[e] >= WORD_THRESHOLD)
    .sort((a, b) => s.emotions[b] - s.emotions[a])
    .map((e) => WORDS[e]);
  const words = s.load.overload >= OVERLOADED ? ['on tilt', ...found] : found;
  return words.slice(0, MAX_WORDS);
}

export function botBiasOf(s: Snapshot): Bias {
  const b = s.bias;
  return {
    aggression: b.aggression,
    bluff: b.bluff,
    tightness: 1 / b.looseness,
    sizing: b.sizing,
    stickiness: b.stickiness,
  };
}

export function speakFactorOf(s: Snapshot): number {
  return 1 + SPEAK_GAIN * clamp((s.mood[1] - s.traits.defaultMood[1] + s.load.overload) / 2, -1, 1);
}
