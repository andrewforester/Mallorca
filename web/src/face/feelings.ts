import { EMOTIONS } from '../emotion/index.ts';
import type { Emotion, Pad } from '../emotion/index.ts';
import { regionOf } from './anchors.ts';
import type { Weights } from './anchors.ts';
import { clamp01, smoothstep } from './math.ts';
import { CONTROL_FACE, EMOTION_FACES, MOOD_FACES } from './prototypes.ts';
import type { FacePrototype } from './prototypes.ts';

export interface Feelings {
  emotions: Readonly<Record<Emotion, number>>;
  mood: Pad;
  mask: number;
  acted: Pad | null;
  expressiveness: number;
}

export interface Expression {
  weights: Weights;
  head: [number, number, number];
  gaze: [number, number];
  blink: number;
  shine: number;
}

export const TONIC = 0.9;
export const EFFORT = 1;
export const LEAK = 0.5;
export const YIELD = 0.8;

const CONTROLLABLE = { brows: 0.35, eyes: 0.5, mouth: 0.9 } as const;
const HEAD_CONTROLLABLE = 0.7;
const GAZE_CONTROLLABLE = 0.6;

const OPPOSED: ReadonlyArray<readonly [string, string, number, number]> = [
  ['mouthSmileLeft', 'mouthFrownLeft', YIELD, YIELD],
  ['mouthSmileRight', 'mouthFrownRight', YIELD, YIELD],
  ['eyeUpperLidUpL', 'eyeBlinkLeft', YIELD, YIELD],
  ['eyeUpperLidUpR', 'eyeBlinkRight', YIELD, YIELD],
  ['eyeUpperLidUpL', 'eyeRelaxL', YIELD, YIELD],
  ['eyeUpperLidUpR', 'eyeRelaxR', YIELD, YIELD],
  ['eyePupilWideL', 'eyePupilNarrowL', YIELD, YIELD],
  ['eyePupilWideR', 'eyePupilNarrowR', YIELD, YIELD],
  ...(['UL', 'DL', 'UR', 'DR'] as const).map(
    (c) => [`mouthPress${c}`, `mouthUpperLipRaise${c.at(-1)}`, 1, 0.1] as const,
  ),
  ['mouthLipsPressL', 'mouthUpperLipRaiseL', 1, 0.1],
  ['mouthLipsPressR', 'mouthUpperLipRaiseR', 1, 0.1],
];

interface Layer {
  face: FacePrototype;
  level: number;
  hidden: number;
}

export function activation(level: number, threshold: number): number {
  const x = clamp01((level - threshold) / (1 - threshold));
  return 1 - (1 - x) ** 2;
}

export const combine = (values: readonly number[]): number =>
  1 - values.reduce((rest, v) => rest * (1 - clamp01(v)), 1);

const shownShare = (hidden: number, controllable: number, level: number): number =>
  1 - hidden * controllable * (1 - LEAK * smoothstep(0.4, 1, level));

function layersOf(f: Feelings): Layer[] {
  const layers: Layer[] = [];
  const add = (face: FacePrototype, level: number, hidden: number) => {
    if (level > 0) layers.push({ face, level: clamp01(level), hidden });
  };
  let strongest = 0;
  for (const e of EMOTIONS) {
    const level = clamp01(f.emotions[e] * f.expressiveness);
    strongest = Math.max(strongest, level);
    add(EMOTION_FACES[e], level, f.mask);
  }
  f.mood.forEach((v, i) => {
    const axis = MOOD_FACES[i]!;
    add(v > 0 ? axis.up : axis.down, TONIC * Math.abs(v) * f.expressiveness, 0);
  });
  f.acted?.forEach((v, i) => {
    const axis = MOOD_FACES[i]!;
    add(v > 0 ? axis.up : axis.down, f.mask * Math.abs(v), 0);
  });
  add(CONTROL_FACE, EFFORT * f.mask * strongest, 0);
  return layers;
}

function oppose(w: Weights): void {
  for (const [a, b, yieldA, yieldB] of OPPOSED) {
    const shared = Math.min(w[a] ?? 0, w[b] ?? 0);
    if (shared <= 0) continue;
    w[a] = w[a]! - yieldA * shared;
    w[b] = w[b]! - yieldB * shared;
  }
}

function addScaled(target: number[], from: readonly number[], k: number): void {
  from.forEach((v, i) => {
    target[i] = (target[i] ?? 0) + v * k;
  });
}

export function expressionOf(f: Feelings): Expression {
  const parts = new Map<string, number[]>();
  const head: [number, number, number] = [0, 0, 0];
  const gaze: [number, number] = [0, 0];
  let blink = 1;
  let shine = 1;
  for (const { face, level, hidden } of layersOf(f)) {
    for (const [name, [value, threshold]] of Object.entries(face.weights)) {
      const share = shownShare(hidden, CONTROLLABLE[regionOf(name)], level);
      const v = value * activation(level, threshold) * share;
      if (v > 0) parts.set(name, [...(parts.get(name) ?? []), v]);
    }
    addScaled(head, face.head, level * shownShare(hidden, HEAD_CONTROLLABLE, level));
    addScaled(gaze, face.gaze, level * shownShare(hidden, GAZE_CONTROLLABLE, level));
    const a = activation(level, 0);
    blink *= 1 + a * (face.blink - 1);
    shine *= 1 + a * (face.shine - 1);
  }
  const weights: Weights = {};
  for (const [name, values] of parts) weights[name] = combine(values);
  oppose(weights);
  return { weights, head, gaze, blink, shine };
}
