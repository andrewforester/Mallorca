import type { Pad, Snapshot } from '../emotion/index.ts';
import { shaped } from './anchors.ts';
import type { Weights } from './anchors.ts';
import { feltPadOf, maskOf, shownPadOf } from './expression.ts';
import { expressionOf } from './feelings.ts';
import type { FaceLook } from './look.ts';
import { clamp01 } from './math.ts';
import { prosodyOf } from './prosody.ts';
import type { Prosody } from './prosody.ts';
import { STANCES } from './stance.ts';
import type { Shown } from './stance.ts';

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
  head: [number, number, number];
  gaze: [number, number];
  idle: IdleState;
  prosody: Prosody;
}

export const nervousOf = (s: Snapshot): number =>
  clamp01(0.7 * s.emotions.fear + 0.4 * s.emotions.shame + 0.3 * Math.max(0, -s.approach));

export const sadnessOf = (s: Snapshot): number =>
  clamp01(s.emotions.distress + s.emotions.disappointment);

export function faceFrame(
  s: Snapshot,
  presenting: Shown | null,
  look: FaceLook,
  mask = maskOf(s.traits.mask, presenting?.effort ?? 0, s.load.overload),
): FaceFrame {
  const felt = feltPadOf(s);
  const acted = presenting === null ? null : STANCES[presenting.stance];
  const shown = shownPadOf(felt, mask, acted);
  const face = expressionOf({
    emotions: s.emotions,
    mood: s.mood,
    mask,
    acted,
    expressiveness: s.traits.expressiveness,
  });
  return {
    felt,
    shown,
    mask,
    weights: withinRange(shaped(face.weights, look, 1)),
    head: face.head,
    gaze: face.gaze,
    idle: { nervous: nervousOf(s), arousal: felt[1], blinkRate: look.blink * face.blink },
    prosody: prosodyOf(shown, s.load.overload, sadnessOf(s)),
  };
}

function withinRange(w: Weights): Weights {
  for (const name of Object.keys(w)) w[name] = clamp01(w[name] ?? 0);
  return w;
}
