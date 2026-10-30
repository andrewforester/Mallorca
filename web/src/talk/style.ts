import type { Mood } from './mood.ts';

export interface Style {
  aggression: number;
  bluff: number;
  tightness: number;
}

export const NEUTRAL_STYLE: Style = { aggression: 1, bluff: 1, tightness: 1 };

const clampTo = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

export function styleOf(mood: Mood): Style {
  return {
    aggression: clampTo(1 + 0.25 * mood.tilt + 0.1 * (mood.confidence + mood.form), 0.8, 1.25),
    bluff: clampTo(1 + 0.3 * mood.tilt, 0.8, 1.3),
    tightness: clampTo(1 + 0.2 * mood.caution - 0.1 * mood.cheer, 0.85, 1.2),
  };
}
