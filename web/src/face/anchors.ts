import type { Emotion, Pad } from '../emotion/index.ts';
import type { FaceLook } from './look.ts';

export type Weights = Record<string, number>;

export interface Anchor {
  id: string;
  pad: Pad;
  face: Weights;
}

export const ANCHORS: readonly Anchor[] = [
  { id: 'neutral', pad: [0, 0, 0], face: {} },
  {
    id: 'content',
    pad: [0.5, -0.25, 0.1],
    face: {
      mouthSmileLeft: 0.35,
      mouthSmileRight: 0.35,
      cheekSquintLeft: 0.18,
      cheekSquintRight: 0.18,
      eyeSquintLeft: 0.12,
      eyeSquintRight: 0.12,
      eyeBlinkLeft: 0.06,
      eyeBlinkRight: 0.06,
    },
  },
  {
    id: 'joy',
    pad: [0.85, 0.55, 0.3],
    face: {
      mouthSmileLeft: 0.9,
      mouthSmileRight: 0.9,
      cheekSquintLeft: 0.65,
      cheekSquintRight: 0.65,
      eyeSquintLeft: 0.45,
      eyeSquintRight: 0.45,
      mouthDimpleLeft: 0.25,
      mouthDimpleRight: 0.25,
      jawOpen: 0.2,
      mouthUpperUpLeft: 0.2,
      mouthUpperUpRight: 0.2,
      browOuterUpLeft: 0.2,
      browOuterUpRight: 0.2,
    },
  },
  {
    id: 'smug',
    pad: [0.35, 0.1, 0.75],
    face: {
      mouthSmileLeft: 0.5,
      mouthSmileRight: 0.2,
      mouthDimpleLeft: 0.35,
      eyeSquintLeft: 0.3,
      eyeSquintRight: 0.25,
      browOuterUpRight: 0.25,
      browDownLeft: 0.1,
    },
  },
  {
    id: 'calm',
    pad: [0.25, -0.7, 0.05],
    face: {
      eyeBlinkLeft: 0.25,
      eyeBlinkRight: 0.25,
      mouthSmileLeft: 0.12,
      mouthSmileRight: 0.12,
      browInnerUp: 0.05,
    },
  },
  {
    id: 'sad',
    pad: [-0.65, -0.45, -0.4],
    face: {
      browInnerUp: 0.8,
      mouthFrownLeft: 0.65,
      mouthFrownRight: 0.65,
      mouthShrugLower: 0.4,
      eyeSquintLeft: 0.12,
      eyeSquintRight: 0.12,
      eyeBlinkLeft: 0.15,
      eyeBlinkRight: 0.15,
      mouthPressLeft: 0.15,
      mouthPressRight: 0.15,
    },
  },
  {
    id: 'sulk',
    pad: [-0.5, -0.15, 0.2],
    face: {
      mouthPressLeft: 0.45,
      mouthPressRight: 0.45,
      mouthShrugLower: 0.35,
      mouthFrownLeft: 0.25,
      mouthFrownRight: 0.25,
      browDownLeft: 0.3,
      browDownRight: 0.3,
      eyeBlinkLeft: 0.22,
      eyeBlinkRight: 0.22,
      mouthLeft: 0.15,
    },
  },
  {
    id: 'irritated',
    pad: [-0.35, 0.35, 0.3],
    face: {
      browDownLeft: 0.5,
      browDownRight: 0.5,
      mouthPressLeft: 0.45,
      mouthPressRight: 0.45,
      eyeSquintLeft: 0.25,
      eyeSquintRight: 0.25,
      mouthRollLower: 0.12,
      noseSneerLeft: 0.12,
      noseSneerRight: 0.12,
    },
  },
  {
    id: 'anger',
    pad: [-0.65, 0.8, 0.65],
    face: {
      browDownLeft: 1,
      browDownRight: 1,
      noseSneerLeft: 0.5,
      noseSneerRight: 0.5,
      mouthPressLeft: 0.55,
      mouthPressRight: 0.55,
      eyeSquintLeft: 0.45,
      eyeSquintRight: 0.45,
      eyeWideLeft: 0.1,
      eyeWideRight: 0.1,
      jawForward: 0.2,
      mouthUpperUpLeft: 0.2,
      mouthUpperUpRight: 0.2,
      mouthRollLower: 0.15,
    },
  },
  {
    id: 'worry',
    pad: [-0.3, 0.25, -0.5],
    face: {
      browInnerUp: 0.55,
      mouthPressLeft: 0.35,
      mouthPressRight: 0.35,
      mouthRollLower: 0.3,
      eyeWideLeft: 0.12,
      eyeWideRight: 0.12,
      mouthStretchLeft: 0.18,
      mouthStretchRight: 0.18,
    },
  },
  {
    id: 'fear',
    pad: [-0.55, 0.75, -0.7],
    face: {
      browInnerUp: 0.85,
      browOuterUpLeft: 0.35,
      browOuterUpRight: 0.35,
      eyeWideLeft: 0.55,
      eyeWideRight: 0.55,
      mouthStretchLeft: 0.4,
      mouthStretchRight: 0.4,
      mouthPressLeft: 0.15,
      mouthPressRight: 0.15,
      jawOpen: 0.06,
    },
  },
];

export const SIGMA = 0.27;
export const FACE_GAIN = 1.4;

export const PULSE_FACES: Readonly<Record<string, Weights>> = {
  joy: ANCHORS[2]!.face,
  pride: ANCHORS[3]!.face,
  sad: ANCHORS[5]!.face,
  anger: ANCHORS[8]!.face,
  fear: ANCHORS[10]!.face,
  surprise: {
    browInnerUp: 0.85,
    browOuterUpLeft: 0.75,
    browOuterUpRight: 0.75,
    eyeWideLeft: 0.75,
    eyeWideRight: 0.75,
    jawOpen: 0.28,
    mouthFunnel: 0.15,
  },
  contempt: {
    mouthSmileRight: 0.45,
    mouthDimpleRight: 0.35,
    noseSneerRight: 0.25,
    browDownLeft: 0.2,
    eyeSquintRight: 0.2,
  },
  flash: {
    browInnerUp: 0.6,
    browOuterUpLeft: 0.6,
    browOuterUpRight: 0.6,
    mouthSmileLeft: 0.35,
    mouthSmileRight: 0.35,
    eyeWideLeft: 0.25,
    eyeWideRight: 0.25,
  },
  relief: {
    mouthSmileLeft: 0.5,
    mouthSmileRight: 0.45,
    cheekSquintLeft: 0.25,
    cheekSquintRight: 0.25,
    browInnerUp: 0.2,
    eyeBlinkLeft: 0.2,
    eyeBlinkRight: 0.2,
  },
  shame: {
    browInnerUp: 0.5,
    mouthPressLeft: 0.4,
    mouthPressRight: 0.4,
    mouthRollLower: 0.3,
    eyeLookDownLeft: 0.4,
    eyeLookDownRight: 0.4,
    mouthSmileLeft: 0.12,
  },
  control: { mouthPressLeft: 0.6, mouthPressRight: 0.6, mouthRollLower: 0.35, mouthRollUpper: 0.2 },
  sigh: {
    mouthFunnel: 0.35,
    jawOpen: 0.12,
    browInnerUp: 0.3,
    eyeBlinkLeft: 0.35,
    eyeBlinkRight: 0.35,
  },
};

export const EMOTION_PULSE: Readonly<Record<Emotion, string>> = {
  hope: 'flash',
  fear: 'fear',
  joy: 'joy',
  distress: 'sad',
  relief: 'relief',
  disappointment: 'sad',
  pride: 'pride',
  shame: 'shame',
  anger: 'anger',
  injustice: 'anger',
  surprise: 'surprise',
};

export function blendOf(p: Pad): number[] {
  const ws = ANCHORS.map((a) => {
    const d2 = (a.pad[0] - p[0]) ** 2 + (a.pad[1] - p[1]) ** 2 + (a.pad[2] - p[2]) ** 2;
    return Math.exp(-d2 / (SIGMA * SIGMA));
  });
  const sum = ws.reduce((x, y) => x + y, 0) || 1;
  return ws.map((w) => w / sum);
}

export const regionOf = (n: string): 'brows' | 'eyes' | 'mouth' =>
  /^brow/.test(n) ? 'brows' : /^(eye|cheekSquint)/.test(n) ? 'eyes' : 'mouth';

export function sideGain(n: string, side: number): number {
  if (!/^mouth/.test(n)) {
    return 1;
  }
  if (/Left$/.test(n)) {
    return 1 + 0.35 * side;
  }
  return /Right$/.test(n) ? 1 - 0.35 * side : 1;
}

export function shaped(face: Weights, look: FaceLook, gain: number): Weights {
  const out: Weights = {};
  for (const [n, v] of Object.entries(face)) {
    out[n] = v * gain * look[regionOf(n)] * sideGain(n, look.smileSide);
  }
  return out;
}

export function faceOf(mix: readonly number[], look: FaceLook, expressiveness: number): Weights {
  const w: Weights = {};
  ANCHORS.forEach((a, i) => {
    const k = mix[i] ?? 0;
    if (k < 0.002) {
      return;
    }
    for (const [n, v] of Object.entries(a.face)) {
      w[n] = (w[n] ?? 0) + v * k;
    }
  });
  return shaped(w, look, expressiveness * FACE_GAIN);
}
