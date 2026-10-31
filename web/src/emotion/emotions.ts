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

export const HALF_LIFE_S: Readonly<Record<Emotion, number>> = {
  hope: 6,
  fear: 6,
  joy: 30,
  distress: 40,
  relief: 15,
  disappointment: 30,
  pride: 45,
  shame: 60,
  anger: 60,
  injustice: 90,
  surprise: 1.2,
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

export function decay(emotions: Emotions, dt: number, factor: (e: Emotion) => number): Emotions {
  const next = { ...emotions };
  for (const e of EMOTIONS) {
    next[e] = emotions[e] * 0.5 ** (dt / (HALF_LIFE_S[e] * factor(e)));
  }
  return next;
}
