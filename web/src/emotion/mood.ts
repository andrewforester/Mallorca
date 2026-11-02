import { EMOTIONS, EMOTION_PAD, clamp } from './emotions.ts';
import type { Emotions, Pad } from './emotions.ts';

export interface MoodConfig {
  changeTimeS: number;
  returnTimeS: number;
}

export const GAME_MOOD: MoodConfig = { changeTimeS: 600, returnTimeS: 1200 };

const ACTIVE = 0.05;
const SQRT3 = Math.sqrt(3);

export type Octant =
  'exuberant' | 'bored' | 'dependent' | 'disdainful' | 'relaxed' | 'anxious' | 'docile' | 'hostile';

const OCTANTS: Readonly<Record<string, Octant>> = {
  '+++': 'exuberant',
  '---': 'bored',
  '++-': 'dependent',
  '--+': 'disdainful',
  '+-+': 'relaxed',
  '-+-': 'anxious',
  '+--': 'docile',
  '-++': 'hostile',
};

export function emotionCenter(e: Emotions): { center: Pad; intensity: number } | null {
  let p = 0;
  let a = 0;
  let d = 0;
  let weight = 0;
  let count = 0;
  for (const name of EMOTIONS) {
    const v = e[name];
    if (v < ACTIVE) {
      continue;
    }
    const pad = EMOTION_PAD[name];
    p += v * pad[0];
    a += v * pad[1];
    d += v * pad[2];
    weight += v;
    count++;
  }
  if (count === 0) {
    return null;
  }
  return {
    center: [p / weight, a / weight, d / weight],
    intensity: Math.min(1, weight / count),
  };
}

const sub = (a: Pad, b: Pad): Pad => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Pad, b: Pad): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Pad): number => Math.sqrt(dot(a, a));
const clampPad = (a: Pad): Pad => [clamp(a[0]), clamp(a[1]), clamp(a[2])];

function moveToward(from: Pad, to: Pad, distance: number): Pad {
  const d = sub(to, from);
  const len = norm(d);
  if (len <= distance || len === 0) {
    return to;
  }
  const k = distance / len;
  return [from[0] + d[0] * k, from[1] + d[1] * k, from[2] + d[2] * k];
}

export interface MoodFrame extends MoodConfig {
  defaultMood: Pad;
}

export function stepMood(mood: Pad, e: Emotions, dt: number, frame: MoodFrame): Pad {
  const { defaultMood } = frame;
  const config = frame;
  const c = emotionCenter(e);
  if (!c) {
    return moveToward(mood, defaultMood, (SQRT3 / config.returnTimeS) * dt);
  }
  let next = mood;
  const step = (c.intensity / config.changeTimeS) * dt;
  if (dot(next, c.center) < dot(c.center, c.center)) {
    next = moveToward(next, c.center, step);
  } else {
    const len = norm(c.center) || 1;
    next = [
      next[0] + (c.center[0] / len) * step,
      next[1] + (c.center[1] / len) * step,
      next[2] + (c.center[2] / len) * step,
    ];
  }
  return clampPad(next);
}

export function octantOf(p: Pad): {
  octant: Octant;
  strength: 'slightly' | 'moderately' | 'fully';
} {
  const key = p.map((v) => (v >= 0 ? '+' : '-')).join('');
  const length = norm(p);
  const strength =
    length < SQRT3 / 3 ? 'slightly' : length < (2 * SQRT3) / 3 ? 'moderately' : 'fully';
  return { octant: OCTANTS[key] ?? 'relaxed', strength };
}
