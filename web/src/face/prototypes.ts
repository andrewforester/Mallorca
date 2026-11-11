import type { Emotion } from '../emotion/index.ts';

export type Cue = readonly [value: number, threshold: number];
export type Angles = readonly [pitch: number, yaw: number, roll: number];

export interface FacePrototype {
  weights: Readonly<Record<string, Cue>>;
  head: Angles;
  gaze: readonly [number, number];
  blink: number;
  shine: number;
}

type Cues = Record<string, Cue>;

const both = (name: string, value: number, threshold = 0): Cues => ({
  [`${name}Left`]: [value, threshold],
  [`${name}Right`]: [value, threshold],
});

const sides = (name: string, value: number, threshold = 0): Cues => ({
  [`${name}L`]: [value, threshold],
  [`${name}R`]: [value, threshold],
});

const corners = (name: string, value: number, threshold = 0): Cues => ({
  [`${name}UL`]: [value, threshold],
  [`${name}UR`]: [value, threshold],
  [`${name}DL`]: [value, threshold],
  [`${name}DR`]: [value, threshold],
});

const face = (
  weights: Cues,
  head: Angles = [0, 0, 0],
  gaze: readonly [number, number] = [0, 0],
  blink = 1,
): FacePrototype => ({ weights, head, gaze, blink, shine: 1 });

const shining = (prototype: FacePrototype, shine: number): FacePrototype => ({
  ...prototype,
  shine,
});

const FACES: Readonly<Record<Emotion, FacePrototype>> = {
  anger: face(
    {
      ...sides('browLateral', 0.7),
      ...sides('eyeLowerLidUp', 0.7),
      ...corners('mouthPress', 0.5),
      ...both('browDown', 0.7, 0.1),
      ...sides('mouthLipsPress', 0.4, 0.3),
      ...corners('mouthLipsTighten', 0.35, 0.3),
      ...both('mouthFrown', 0.25, 0.3),
      ...sides('eyeSquintInner', 0.45, 0.35),
      ...sides('eyeUpperLidUp', 0.35, 0.45),
      ...sides('jawChinRaiseD', 0.3, 0.5),
      ...sides('jawClench', 0.5, 0.5),
      ...sides('noseNostrilDilate', 0.4, 0.6),
    },
    [0.16, 0, 0],
    [0, -0.1],
    0.5,
  ),
  injustice: face(
    {
      mouthSharpCornerPullL: [0.65, 0],
      mouthDimpleLeft: [0.35, 0],
      ...sides('eyeRelax', 0.5),
      ...sides('browLateral', 0.4),
      ...both('browDown', 0.4, 0.1),
      ...sides('eyeSquintInner', 0.4, 0.1),
      ...sides('eyeLowerLidUp', 0.35, 0.1),
      ...corners('mouthPress', 0.3, 0.2),
      noseWrinkleUpperL: [0.3, 0.4],
    },
    [0.03, -0.05, 0.05],
    [0.06, -0.03],
    0.8,
  ),
  fear: face(
    {
      ...sides('browRaiseIn', 0.9),
      ...corners('mouthPress', 0.3),
      ...both('browOuterUp', 0.4, 0.3),
      ...sides('browLateral', 0.3, 0.2),
      ...sides('eyeUpperLidUp', 0.6, 0.3),
      ...both('mouthStretch', 0.5, 0.3),
      ...sides('eyeWiden', 0.35, 0.5),
      ...sides('eyePupilWide', 0.3, 0.2),
      jawOpen: [0.08, 0.7],
    },
    [-0.04, 0, 0],
    [0, 0],
    1.8,
  ),
  joy: face(
    {
      ...both('mouthSmile', 1),
      ...both('cheekSquint', 0.45, 0.15),
      ...both('mouthDimple', 0.45, 0.2),
      ...both('eyeSquint', 0.1, 0.4),
      mouthRollUpper: [0.2, 0.3],
      ...both('browOuterUp', 0.15, 0.4),
      ...both('mouthUpperUp', 0.08, 0.5),
      jawOpen: [0.05, 0.6],
    },
    [-0.03, 0, 0.03],
  ),
  pride: face(
    {
      mouthSmileLeft: [0.4, 0],
      mouthSmileRight: [0.25, 0],
      ...both('mouthDimple', 0.4),
      ...corners('mouthPress', 0.3),
      ...both('eyeBlink', 0.12),
      ...sides('jawChinRaiseD', 0.2, 0.3),
    },
    [-0.14, 0, 0.02],
    [0, 0.06],
    0.8,
  ),
  hope: face(
    {
      ...sides('eyeUpperLidUp', 0.25),
      ...sides('eyePupilWide', 0.25),
      ...both('browOuterUp', 0.4),
      ...both('mouthSmile', 0.35),
      ...sides('browRaiseIn', 0.25),
      jawOpen: [0.06, 0.4],
    },
    [-0.06, 0, 0.05],
    [0, -0.02],
    0.7,
  ),
  relief: face(
    {
      ...both('eyeBlink', 0.25),
      ...both('mouthSmile', 0.35),
      ...sides('browRaiseIn', 0.25),
      ...both('cheekSquint', 0.2),
      mouthFunnel: [0.12, 0.5],
    },
    [-0.06, 0, 0],
    [0, 0],
    0.8,
  ),
  distress: face(
    {
      ...sides('browRaiseIn', 0.85),
      ...both('mouthFrown', 0.7, 0.1),
      ...sides('browLateral', 0.25, 0.2),
      ...sides('eyeRelax', 0.3, 0.2),
      ...sides('jawChinRaiseD', 0.3, 0.3),
      ...both('eyeBlink', 0.15, 0.3),
      ...sides('eyeSquintInner', 0.2, 0.5),
      ...sides('eyePupilNarrow', 0.2, 0.2),
    },
    [0.12, 0, 0],
    [0, 0.15],
    1.2,
  ),
  disappointment: face(
    {
      ...both('mouthFrown', 0.8),
      ...corners('mouthPress', 0.45),
      ...sides('eyeRelax', 0.5, 0.1),
      ...sides('browRaiseIn', 0.35, 0.2),
      ...sides('jawChinRaiseD', 0.25, 0.4),
      ...sides('eyePupilNarrow', 0.2, 0.2),
    },
    [0.06, 0, -0.03],
    [0, 0.08],
    1.1,
  ),
  shame: face(
    {
      ...sides('browRaiseIn', 0.55),
      ...sides('mouthLipsPress', 0.4),
      ...sides('mouthLowerLipRollIn', 0.4, 0.2),
      ...both('eyeBlink', 0.15, 0.3),
      ...sides('eyeRelax', 0.4, 0.5),
      ...both('mouthSmile', 0.12, 0.5),
      ...sides('eyePupilNarrow', 0.2, 0.3),
    },
    [0.24, 0.08, 0],
    [0.15, 0.45],
    1.5,
  ),
  surprise: face(
    {
      ...sides('browRaiseIn', 0.85),
      ...both('browOuterUp', 0.85),
      ...sides('eyeUpperLidUp', 0.7),
      ...sides('eyeWiden', 0.5, 0.2),
      ...sides('eyePupilWide', 0.25),
      jawOpen: [0.3, 0.3],
      mouthFunnel: [0.1, 0.4],
    },
    [-0.06, 0, 0],
    [0, 0],
    0.3,
  ),
};

const SHINE: Readonly<Record<Emotion, number>> = {
  joy: 1.3,
  hope: 1.25,
  surprise: 1.2,
  pride: 1.15,
  relief: 1.1,
  fear: 1,
  anger: 0.95,
  injustice: 0.8,
  shame: 0.5,
  disappointment: 0.45,
  distress: 0.4,
};

export const EMOTION_FACES: Readonly<Record<Emotion, FacePrototype>> = Object.fromEntries(
  Object.entries(FACES).map(([e, prototype]) => [e, shining(prototype, SHINE[e as Emotion])]),
) as Record<Emotion, FacePrototype>;

export const CONTROL_FACE: FacePrototype = face({
  ...sides('mouthLipsPress', 0.6),
  ...sides('jawChinRaiseD', 0.4),
  ...sides('mouthLowerLipRollIn', 0.3),
});

export interface AxisFaces {
  up: FacePrototype;
  down: FacePrototype;
}

export const MOOD_FACES: readonly [AxisFaces, AxisFaces, AxisFaces] = [
  {
    up: face({
      ...both('mouthSmile', 0.6),
      ...both('cheekSquint', 0.2),
      ...both('mouthDimple', 0.2),
    }),
    down: face({
      ...both('mouthFrown', 0.5),
      ...both('browDown', 0.45),
      ...sides('browLateral', 0.3),
      ...sides('mouthLipsPress', 0.35),
      ...sides('eyeLowerLidUp', 0.3),
    }),
  },
  {
    up: face(
      { ...sides('eyePupilWide', 0.25), ...sides('eyeUpperLidUp', 0.15) },
      [0, 0, 0],
      [0, 0],
      1.2,
    ),
    down: face({ ...sides('eyeRelax', 0.4) }, [0, 0, 0], [0, 0], 0.7),
  },
  {
    up: face(
      { ...sides('jawChinRaiseD', 0.4), ...corners('mouthLipsTighten', 0.3) },
      [-0.12, 0, 0.03],
      [0, 0.04],
      0.7,
    ),
    down: face({ ...sides('browRaiseIn', 0.45) }, [0.1, 0, 0], [0, 0.12], 1.3),
  },
];
