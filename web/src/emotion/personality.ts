import { EMOTIONS, NEGATIVE, POSITIVE, clamp } from './emotions.ts';
import type { Emotion, Pad } from './emotions.ts';
import { NEUTRAL_PLAY_BIAS } from './biasKeys.ts';
import type { PlayBias } from './biasKeys.ts';

export interface BigFive {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface Personality {
  bigFive: BigFive;
  suppression: number;
  experience: number;
}

export interface Traits {
  defaultMood: Pad;
  gains: Readonly<Record<Emotion, number>>;
  halfLifeFactor: Readonly<Record<Emotion, number>>;
  composure: number;
  discipline: number;
  expressiveness: number;
  mask: number;
  talkativeness: number;
  baseline: PlayBias;
}

export function defaultMoodOf(b: BigFive): Pad {
  const stability = -b.neuroticism;
  return [
    clamp(0.21 * b.extraversion + 0.59 * b.agreeableness + 0.19 * stability),
    clamp(0.15 * b.openness + 0.3 * b.agreeableness - 0.57 * stability),
    clamp(
      0.25 * b.openness +
        0.17 * b.conscientiousness +
        0.6 * b.extraversion -
        0.32 * b.agreeableness,
    ),
  ];
}

function gainsOf(b: BigFive): Record<Emotion, number> {
  const positive = 1 + 0.25 * b.extraversion;
  return {
    hope: positive,
    joy: positive,
    relief: positive,
    pride: positive,
    fear: 1 + 0.4 * b.neuroticism,
    distress: 1 + 0.35 * b.neuroticism,
    disappointment: 1 + 0.35 * b.neuroticism,
    shame: 1 + 0.25 * b.neuroticism + 0.2 * b.conscientiousness,
    anger: 1 + 0.2 * b.neuroticism - 0.35 * b.agreeableness,
    injustice: 1 + 0.35 * b.neuroticism - 0.15 * b.agreeableness,
    surprise: 1 + 0.2 * b.openness,
  };
}

function halfLifeFactorOf(b: BigFive): Record<Emotion, number> {
  const factor = (e: Emotion): number => {
    if (NEGATIVE.has(e)) {
      return 1 + 0.5 * b.neuroticism;
    }
    return POSITIVE.has(e) ? 1 + 0.25 * b.extraversion : 1;
  };
  return Object.fromEntries(EMOTIONS.map((e) => [e, factor(e)])) as Record<Emotion, number>;
}

export function traitsOf(p: Personality): Traits {
  const b = p.bigFive;
  return {
    defaultMood: defaultMoodOf(b),
    gains: gainsOf(b),
    halfLifeFactor: halfLifeFactorOf(b),
    composure: clamp(
      0.45 + 0.15 * b.conscientiousness - 0.25 * b.neuroticism + 0.35 * p.experience,
      0.1,
      1.2,
    ),
    discipline: clamp(
      0.25 + 0.2 * b.conscientiousness - 0.15 * b.neuroticism + 0.5 * p.experience,
      0,
      0.95,
    ),
    expressiveness: clamp(0.85 + 0.35 * b.extraversion + 0.1 * b.neuroticism, 0.3, 1.4),
    mask: clamp(p.suppression, 0, 1),
    talkativeness: clamp(0.5 + 0.4 * b.extraversion, 0.1, 1),
    baseline: NEUTRAL_PLAY_BIAS,
  };
}
