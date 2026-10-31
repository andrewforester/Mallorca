import type { MoodConfig } from '../../src/emotion/index.ts';

export const LAB_SPEEDUP = 30;
export const LAB_MOOD: MoodConfig = {
  changeTimeS: 600 / LAB_SPEEDUP,
  returnTimeS: 1200 / LAB_SPEEDUP,
};

export const clamp = (value: number, low = -1, high = 1): number =>
  Math.max(low, Math.min(high, value));

export const clamp01 = (value: number): number => clamp(value, 0, 1);

export const smoothstep = (low: number, high: number, x: number): number => {
  const t = clamp01((x - low) / (high - low));
  return t * t * (3 - 2 * t);
};
