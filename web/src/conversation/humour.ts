import type { Rng } from '../cards/index.ts';
import type { BigFive, Snapshot } from '../emotion/index.ts';
import type { Act, Occasion } from './types.ts';

export const HUMOUR_STYLES = [
  'affiliative',
  'selfEnhancing',
  'aggressive',
  'selfDefeating',
] as const;

export type HumourStyle = (typeof HUMOUR_STYLES)[number];

type Weights = Readonly<Record<keyof BigFive, number>>;

export const HUMOUR_WEIGHTS: Readonly<Record<HumourStyle, Weights>> = {
  affiliative: {
    extraversion: 0.46,
    agreeableness: 0.14,
    conscientiousness: 0.04,
    neuroticism: -0.08,
    openness: 0.26,
  },
  selfEnhancing: {
    extraversion: 0.33,
    agreeableness: 0.2,
    conscientiousness: 0.1,
    neuroticism: -0.22,
    openness: 0.24,
  },
  aggressive: {
    extraversion: 0.08,
    agreeableness: -0.38,
    conscientiousness: -0.26,
    neuroticism: 0.06,
    openness: -0.05,
  },
  selfDefeating: {
    extraversion: -0.02,
    agreeableness: -0.07,
    conscientiousness: -0.22,
    neuroticism: 0.19,
    openness: -0.01,
  },
};

const OUTWARD: readonly HumourStyle[] = ['affiliative', 'aggressive'];
const INWARD: readonly HumourStyle[] = ['selfEnhancing', 'selfDefeating'];

export const ACT_STYLES: Readonly<Record<Act, readonly HumourStyle[]>> = {
  tease: OUTWARD,
  enjoy: OUTWARD,
  react: OUTWARD,
  press: ['aggressive', 'affiliative'],
  claim: ['aggressive', 'affiliative'],
  concede: INWARD,
  complain: INWARD,
  deflect: HUMOUR_STYLES,
  stall: HUMOUR_STYLES,
  answer: HUMOUR_STYLES,
};

export const JOKE_BASE = 0.15;
export const COOL_LINES = 3;

const GAIN = 0.2;
const COOL = 0.3;
const ANSWER = 0.5;
const SOFT = 0.6;
const SHARP = 1.2;

export interface Humour {
  style: HumourStyle;
  target: 'self' | 'play' | 'situation';
  intensity: 'soft' | 'clear' | 'sharp';
  softened: boolean;
}

export interface HumourDraw {
  tendency: Record<HumourStyle, number>;
  state: Record<HumourStyle, number>;
  p: number;
  roll: number;
  styleRoll: number | null;
  style: HumourStyle | null;
}

export interface HumourInput {
  act: Act;
  occasion: Occasion;
  bigFive: BigFive;
  snapshot: Snapshot;
  linesSinceJoke: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const byStyle = (f: (s: HumourStyle) => number): Record<HumourStyle, number> => ({
  affiliative: f('affiliative'),
  selfEnhancing: f('selfEnhancing'),
  aggressive: f('aggressive'),
  selfDefeating: f('selfDefeating'),
});

export function tendencyOf(bigFive: BigFive): Record<HumourStyle, number> {
  const traits = Object.keys(bigFive) as (keyof BigFive)[];
  return byStyle((s) => {
    const z = traits.reduce((sum, t) => sum + HUMOUR_WEIGHTS[s][t] * 2 * bigFive[t], 0);
    return clamp(0.5 + GAIN * z, 0, 1);
  });
}

function driversOf(snapshot: Snapshot, bigFive: BigFive): Record<HumourStyle, number> {
  const e = snapshot.emotions;
  const [p, , d] = snapshot.mood;
  const a = (1 + bigFive.agreeableness) / 2;
  const n = (1 + bigFive.neuroticism) / 2;
  const overload = snapshot.load.overload;
  return {
    affiliative: p + e.joy + e.relief + e.hope - e.distress - e.fear - e.anger,
    selfEnhancing: e.relief + (e.distress + e.disappointment) * (1 - n) - overload,
    aggressive: e.anger + e.injustice + e.pride * (1 - a) - e.fear - e.shame,
    selfDefeating: e.shame + e.disappointment * n - Math.max(0, d) - e.pride,
  };
}

export function stateOf(snapshot: Snapshot, bigFive: BigFive): Record<HumourStyle, number> {
  const drivers = driversOf(snapshot, bigFive);
  return byStyle((s) => clamp(Math.exp(drivers[s]), 0.3, 3));
}

export function jokeChance(
  bigFive: BigFive,
  snapshot: Snapshot,
  linesSinceJoke: number,
  act: Act,
): number {
  const nature = clamp(1 + 0.92 * bigFive.extraversion, 0.1, 2);
  const pleasure = clamp(1 + snapshot.mood[0], 0.3, 1.5);
  const calm = (1 - snapshot.load.overload) * (1 - 0.7 * snapshot.emotions.fear);
  const cool = linesSinceJoke < COOL_LINES ? COOL : 1;
  const own = act === 'answer' ? ANSWER : 1;
  return JOKE_BASE * nature * pleasure * calm * cool * own;
}

function targetOf(style: HumourStyle, occasion: Occasion): Humour['target'] {
  if (INWARD.includes(style)) {
    return 'self';
  }
  if (style === 'aggressive') {
    return 'play';
  }
  const players =
    occasion.kind === 'playerRaise' ||
    occasion.kind === 'playerSaid' ||
    occasion.end === 'playerBluffShown';
  return players ? 'play' : 'situation';
}

function intensityOf(v: number): Humour['intensity'] {
  if (v < SOFT) {
    return 'soft';
  }
  return v < SHARP ? 'clear' : 'sharp';
}

function pick(styles: readonly HumourStyle[], weight: (s: HumourStyle) => number, roll: number) {
  const total = styles.reduce((sum, s) => sum + weight(s), 0);
  let left = roll * total;
  for (const s of styles) {
    left -= weight(s);
    if (left < 0) {
      return s;
    }
  }
  return styles[styles.length - 1] ?? null;
}

export function drawHumour(
  input: HumourInput,
  rng: Rng,
): { draw: HumourDraw; humour: Humour | null } {
  const tendency = tendencyOf(input.bigFive);
  const state = stateOf(input.snapshot, input.bigFive);
  const p = jokeChance(input.bigFive, input.snapshot, input.linesSinceJoke, input.act);
  const roll = rng.next();
  const quiet = { tendency, state, p, roll, styleRoll: null, style: null };
  const weight = (s: HumourStyle) => tendency[s] * state[s];
  const styles = ACT_STYLES[input.act].filter((s) => weight(s) > 0);
  if (roll >= p || styles.length === 0) {
    return { draw: quiet, humour: null };
  }
  const styleRoll = rng.next();
  const style = pick(styles, weight, styleRoll) as HumourStyle;
  const humour: Humour = {
    style,
    target: targetOf(style, input.occasion),
    intensity: intensityOf(weight(style)),
    softened: style === 'aggressive' && input.bigFive.agreeableness > 0,
  };
  return { draw: { ...quiet, styleRoll, style }, humour };
}
