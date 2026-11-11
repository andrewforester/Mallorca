export const EMOTIONS = [
  'hope',
  'fear',
  'joy',
  'distress',
  'relief',
  'disappointment',
  'pride',
  'shame',
  'anger',
  'injustice',
  'surprise',
] as const;

export type Emotion = (typeof EMOTIONS)[number];
export type Pad = readonly [number, number, number];
export type Emotions = Readonly<Record<Emotion, number>>;

export const EMOTION_PAD: Readonly<Record<Emotion, Pad>> = {
  hope: [0.2, 0.2, -0.1],
  fear: [-0.64, 0.6, -0.43],
  joy: [0.4, 0.2, 0.1],
  distress: [-0.4, -0.2, -0.5],
  relief: [0.2, -0.3, 0.4],
  disappointment: [-0.3, 0.1, -0.4],
  pride: [0.4, 0.3, 0.3],
  shame: [-0.3, 0.1, -0.6],
  anger: [-0.51, 0.59, 0.25],
  injustice: [-0.5, 0.5, 0.15],
  surprise: [0.1, 0.6, -0.1],
};

export const REFERENCE_HAND_S = 20;

export interface Clock {
  seconds: number;
  hands: number;
}

export const HALF_LIFE_S: Readonly<Record<Emotion, number>> = {
  hope: 6,
  fear: 6,
  joy: 60,
  distress: 80,
  relief: 15,
  disappointment: 60,
  pride: 90,
  shame: 120,
  anger: 120,
  injustice: 180,
  surprise: 1.2,
};

export const HALF_LIFE_HANDS: Readonly<Record<Emotion, number>> = {
  hope: Infinity,
  fear: Infinity,
  joy: 3,
  distress: 4,
  relief: Infinity,
  disappointment: 3,
  pride: 4.5,
  shame: 6,
  anger: 6,
  injustice: 9,
  surprise: Infinity,
};

export const POSITIVE: ReadonlySet<Emotion> = new Set<Emotion>(['hope', 'joy', 'relief', 'pride']);
export const NEGATIVE: ReadonlySet<Emotion> = new Set<Emotion>([
  'fear',
  'distress',
  'disappointment',
  'shame',
  'anger',
  'injustice',
]);

export const clamp = (value: number, low = -1, high = 1): number =>
  Math.max(low, Math.min(high, value));

export const clamp01 = (value: number): number => clamp(value, 0, 1);

export const saturate = (x: number): number => 1 - Math.exp(-Math.max(0, x));

export const smoothstep = (low: number, high: number, x: number): number => {
  const t = clamp01((x - low) / (high - low));
  return t * t * (3 - 2 * t);
};

export function noEmotions(): Emotions {
  return Object.fromEntries(EMOTIONS.map((e) => [e, 0])) as Record<Emotion, number>;
}

export function addImpulse(emotions: Emotions, emotion: Emotion, amount: number): Emotions {
  const a = clamp01(amount);
  return { ...emotions, [emotion]: 1 - (1 - emotions[emotion]) * (1 - a) };
}

export function decay(emotions: Emotions, clock: Clock, factor: (e: Emotion) => number): Emotions {
  const next = { ...emotions };
  for (const e of EMOTIONS) {
    const halfLives = clock.seconds / HALF_LIFE_S[e] + clock.hands / HALF_LIFE_HANDS[e];
    next[e] = emotions[e] * 0.5 ** (halfLives / factor(e));
  }
  return next;
}

export const APPROACH: Readonly<Record<Emotion, number>> = {
  hope: -0.1,
  fear: -0.43,
  joy: 0.1,
  distress: -0.5,
  relief: 0.4,
  disappointment: -0.4,
  pride: 0.3,
  shame: -0.6,
  anger: 0.6,
  injustice: 0.4,
  surprise: -0.1,
};

export const CERTAINTY: Readonly<Record<Emotion, number>> = {
  anger: 0.6,
  pride: 0.6,
  joy: 0.5,
  relief: 0.4,
  injustice: 0.3,
  disappointment: 0,
  distress: -0.1,
  shame: -0.2,
  hope: -0.2,
  surprise: -0.6,
  fear: -0.7,
};

export const ATTACK_S = 0.5;
export const REACTION_S = 1;
const MAX_IMPULSE = 0.999999;
const SETTLED = 1e-9;

export type Pending = Readonly<Partial<Record<Emotion, number>>>;

export const massOf = (amount: number): number =>
  -Math.log(1 - Math.min(MAX_IMPULSE, clamp01(amount)));

export function queue(p: Pending, emotion: Emotion, amount: number): Pending {
  return { ...p, [emotion]: (p[emotion] ?? 0) + massOf(amount) };
}

export function ease(
  e: Emotions,
  p: Pending,
  emotion: Emotion,
  keep: number,
): { emotions: Emotions; pending: Pending } {
  const mass = p[emotion];
  return {
    emotions: { ...e, [emotion]: e[emotion] * keep },
    pending: mass === undefined ? p : { ...p, [emotion]: mass * keep },
  };
}

export function rise(
  e: Emotions,
  p: Pending,
  dt: number,
): { emotions: Emotions; pending: Pending } {
  const share = 1 - 0.5 ** (dt / ATTACK_S);
  const emotions = { ...e };
  const pending: Partial<Record<Emotion, number>> = {};
  for (const name of EMOTIONS) {
    const mass = p[name];
    if (mass === undefined) {
      continue;
    }
    const landed = mass * share;
    emotions[name] = 1 - (1 - e[name]) * Math.exp(-landed);
    if (mass - landed > SETTLED) {
      pending[name] = mass - landed;
    }
  }
  return { emotions, pending };
}
