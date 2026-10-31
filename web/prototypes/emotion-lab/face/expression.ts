import { EMOTIONS, EMOTION_PAD } from '../../../src/emotion/index.ts';
import type { Impulse, Pad, Snapshot } from '../../../src/emotion/index.ts';
import { clamp, clamp01, smoothstep } from '../lab.ts';
import { EMOTION_PULSE } from './anchors.ts';

export const EMOTION_DISPLAY_GAIN = 1;
export const MOOD_DISPLAY_GAIN = 0.5;
export const OVERLOAD_MASK_LOSS = 0.6;
export const PULSE_THRESHOLD = 0.12;

export function maskOf(habit: number, effort: number, overload: number): number {
  return clamp01(habit + (1 - habit) * effort) * (1 - OVERLOAD_MASK_LOSS * overload);
}

export function feltPadOf(s: Snapshot): Pad {
  let [pleasure, arousal, dominance] = s.mood.map((v) => v * MOOD_DISPLAY_GAIN) as [
    number,
    number,
    number,
  ];
  for (const e of EMOTIONS) {
    if (e === 'surprise') {
      continue;
    }
    const v = s.emotions[e] * EMOTION_DISPLAY_GAIN;
    pleasure += v * EMOTION_PAD[e][0];
    arousal += v * EMOTION_PAD[e][1];
    dominance += v * EMOTION_PAD[e][2];
  }
  return [clamp(pleasure), clamp(arousal), clamp(dominance)];
}

export function shownPadOf(felt: Pad, mask: number, acted: Pad | null): Pad {
  const a = acted ?? [0, 0, 0];
  return [
    felt[0] * (1 - mask) + a[0] * mask,
    felt[1] * (1 - mask) + a[1] * mask,
    felt[2] * (1 - mask) + a[2] * mask,
  ];
}

export interface PulsePlan {
  face: string;
  amp: number;
  attack: number;
  hold: number;
  release: number;
  delay: number;
}

export function pulsesFor(impulses: readonly Impulse[], mask: number, leak: number): PulsePlan[] {
  const strongest = new Map<string, number>();
  for (const i of impulses) {
    if (i.amount < PULSE_THRESHOLD) {
      continue;
    }
    const face = EMOTION_PULSE[i.emotion];
    strongest.set(face, Math.max(strongest.get(face) ?? 0, i.amount));
  }
  const s = smoothstep(0.3, 0.75, mask);
  const plans: PulsePlan[] = [];
  for (const [face, amount] of strongest) {
    plans.push({
      face,
      amp: Math.min(1, amount * (1.1 - 0.3 * mask + s * (leak - 1))),
      attack: 0.12 + (0.05 - 0.12) * s,
      hold: (0.5 + 0.8 * amount) * (1 - s) + 0.12 * s,
      release: 0.9 + (0.14 - 0.9) * s,
      delay: 0,
    });
  }
  if (plans.length > 0 && s > 0.05) {
    plans.push({
      face: 'control',
      amp: 0.8 * s,
      attack: 0.15,
      hold: 1.1,
      release: 0.6,
      delay: 0.3,
    });
  }
  return plans;
}
