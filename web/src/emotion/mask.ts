import { clamp01 } from './emotions.ts';

export const OVERLOAD_MASK_LOSS = 0.6;

export function maskOf(habit: number, effort: number, overload: number): number {
  return clamp01(habit + (1 - habit) * effort) * (1 - OVERLOAD_MASK_LOSS * overload);
}
