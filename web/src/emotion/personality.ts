import { EMOTIONS, NEGATIVE, POSITIVE, clamp, clamp01 } from './emotions.ts';
import type { Emotion, Pad } from './emotions.ts';
import type { BiasKey, PlayBias } from './biasKeys.ts';
import { natureOf, styleOf } from './style.ts';

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
  nature: Readonly<Record<BiasKey, number>>;
  selfBlame: number;
  coping: number;
  urgency: number;
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

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

function stancesOf(p: Personality): { selfBlame: number; coping: number; urgency: number } {
  const b = p.bigFive;
  const c = b.conscientiousness;
  const n = b.neuroticism;
  const a = b.agreeableness;
  const e = b.extraversion;
  return {
    selfBlame: sigmoid(1.2 * c + 0.8 * n + 0.8 * a - 0.6 * e),
    coping: sigmoid(-1.2 * n + 0.6 * e - 0.5 * a),
    urgency: clamp01(0.5 * n - 0.5 * c),
  };
}

export function traitsOf(p: Personality): Traits {
  const b = p.bigFive;
  return {
    defaultMood: defaultMoodOf(b),
    gains: gainsOf(b),
    halfLifeFactor: halfLifeFactorOf(b),
    composure: clamp(0.55 - 0.35 * b.neuroticism + 0.1 * b.conscientiousness, 0.15, 1.1),
    discipline: clamp(0.45 + 0.3 * b.conscientiousness - 0.25 * b.neuroticism, 0, 0.95),
    expressiveness: clamp(0.85 + 0.35 * b.extraversion + 0.1 * b.neuroticism, 0.3, 1.4),
    mask: clamp(p.suppression, 0, 1),
    talkativeness: clamp(0.5 + 0.4 * b.extraversion, 0.1, 1),
    baseline: styleOf(b),
    nature: natureOf(b),
    ...stancesOf(p),
  };
}
