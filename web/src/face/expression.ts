import { EMOTIONS, EMOTION_PAD } from '../emotion/index.ts';
export { OVERLOAD_MASK_LOSS, maskOf } from '../emotion/index.ts';
import type { Impulse, Pad, Snapshot } from '../emotion/index.ts';
import { clamp, smoothstep } from './math.ts';
import { EMOTION_PULSE, PULSE_FACES, shaped } from './anchors.ts';
import type { Weights } from './anchors.ts';
import type { FaceLook } from './look.ts';

export const EMOTION_DISPLAY_GAIN = 1;
export const MOOD_DISPLAY_GAIN = 0.5;
export const PULSE_THRESHOLD = 0.12;

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

export interface Pulse {
  weights: Weights;
  amp: number;
  attack: number;
  hold: number;
  release: number;
  delay: number;
  blinks: number;
}

export function pulsesOf(impulses: readonly Impulse[], mask: number, look: FaceLook): Pulse[] {
  return pulsesFor(impulses, mask, look.leak).map((plan) => ({
    weights: shaped(PULSE_FACES[plan.face] ?? {}, look, 1),
    amp: plan.amp,
    attack: plan.attack,
    hold: plan.hold,
    release: plan.release,
    delay: plan.delay,
    blinks: plan.face === 'control' ? 2 : 0,
  }));
}
