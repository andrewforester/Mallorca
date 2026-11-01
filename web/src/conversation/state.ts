import { EMOTIONS, maskOf } from '../emotion/index.ts';
import type { Emotion, LoadSource, Octant, Personality, Snapshot } from '../emotion/index.ts';
import type { StrengthClass } from './strength.ts';

export const FEELING_VERSION = 1;
export const ACTING_EFFORT = 0.6;

const MAX_EMOTIONS = 3;
const EMOTION_FLOOR = 0.1;
const OVERLOAD_FLOOR = 0.1;

export interface FeltEmotion {
  name: Emotion;
  intensity: number;
}

export interface FeelingState {
  version: typeof FEELING_VERSION;
  emotions: FeltEmotion[];
  mood: { octant: Octant; strength: 'slightly' | 'moderately' | 'fully' };
  overload: { level: number; source: LoadSource | null };
  shows: { mask: number; acting: StrengthClass | null };
}

export interface Character {
  version: typeof FEELING_VERSION;
  talkativeness: number;
  warmth: number;
  nerves: number;
  wit: number;
}

const round = (v: number): number => Math.round(v * 100) / 100;
const unit = (v: number): number => round(Math.max(0, Math.min(1, v)));
const half = (v: number): number => unit((1 + v) / 2);

function strongest(s: Snapshot): FeltEmotion[] {
  return EMOTIONS.map((name) => ({ name, intensity: round(s.emotions[name]) }))
    .filter((e) => e.intensity >= EMOTION_FLOOR)
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, MAX_EMOTIONS);
}

export function feelingState(s: Snapshot, acting: StrengthClass | null): FeelingState {
  const level = round(s.load.overload);
  const effort = acting === null ? 0 : ACTING_EFFORT;
  return {
    version: FEELING_VERSION,
    emotions: strongest(s),
    mood: { octant: s.octant.octant, strength: s.octant.strength },
    overload: { level, source: level >= OVERLOAD_FLOOR ? s.load.dominant : null },
    shows: { mask: round(maskOf(s.traits.mask, effort, s.load.overload)), acting },
  };
}

export function characterOf(p: Personality): Character {
  const b = p.bigFive;
  return {
    version: FEELING_VERSION,
    talkativeness: unit(0.5 + 0.4 * b.extraversion),
    warmth: half(b.agreeableness),
    nerves: half(b.neuroticism),
    wit: half(b.openness),
  };
}
