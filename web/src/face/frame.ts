import type { Pad, Snapshot } from '../emotion/index.ts';
import { blendOf, faceOf } from './anchors.ts';
import type { Weights } from './anchors.ts';
import { feltPadOf, maskOf, shownPadOf } from './expression.ts';
import type { FaceLook } from './look.ts';
import { clamp01 } from './math.ts';
import { prosodyOf } from './prosody.ts';
import type { Prosody } from './prosody.ts';
import { poseOf } from './stance.ts';
import type { Stance } from './stance.ts';

export interface IdleState {
  nervous: number;
  arousal: number;
  blinkRate: number;
}

export interface FaceFrame {
  felt: Pad;
  shown: Pad;
  mask: number;
  weights: Weights;
  idle: IdleState;
  prosody: Prosody;
}

export const nervousOf = (s: Snapshot): number =>
  clamp01(0.7 * s.emotions.fear + 0.4 * s.emotions.shame + 0.3 * Math.max(0, -s.mood[2]));

export const sadnessOf = (s: Snapshot): number =>
  clamp01(s.emotions.distress + s.emotions.disappointment);

export function faceFrame(s: Snapshot, stance: Stance | null, look: FaceLook): FaceFrame {
  const pose = poseOf(stance);
  const mask = maskOf(s.traits.mask, pose.effort, s.load.overload);
  const felt = feltPadOf(s);
  const shown = shownPadOf(felt, mask, pose.acted);
  return {
    felt,
    shown,
    mask,
    weights: faceOf(blendOf(shown), look, s.traits.expressiveness),
    idle: { nervous: nervousOf(s), arousal: felt[1], blinkRate: look.blink },
    prosody: prosodyOf(shown, s.load.overload, sadnessOf(s)),
  };
}
