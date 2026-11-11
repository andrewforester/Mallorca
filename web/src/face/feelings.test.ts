import { describe, expect, it } from 'vitest';
import { EMOTIONS } from '../emotion/index.ts';
import type { Emotion, Pad } from '../emotion/index.ts';
import { activation, combine, expressionOf } from './feelings.ts';
import type { Feelings } from './feelings.ts';
import { EMOTION_FACES } from './prototypes.ts';

const none = (): Record<Emotion, number> =>
  Object.fromEntries(EMOTIONS.map((e) => [e, 0])) as Record<Emotion, number>;

const feelings = (levels: Partial<Record<Emotion, number>>, mood: Pad = [0, 0, 0]): Feelings => ({
  emotions: { ...none(), ...levels },
  mood,
  mask: 0,
  acted: null,
  expressiveness: 1,
});

const of = (levels: Partial<Record<Emotion, number>>, mood?: Pad) =>
  expressionOf(feelings(levels, mood));

const total = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);

describe('activation', () => {
  it('rises continuously from its threshold and saturates at one', () => {
    expect(activation(0, 0)).toBe(0);
    expect(activation(0.3, 0.3)).toBe(0);
    expect(activation(1, 0.3)).toBe(1);
    let last = 0;
    for (let i = 0; i <= 100; i += 1) {
      const a = activation(i / 100, 0.2);
      expect(a).toBeGreaterThanOrEqual(last);
      expect(a - last).toBeLessThan(0.05);
      last = a;
    }
  });

  it('is already visible at a fifth of the feeling', () => {
    expect(activation(0.2, 0)).toBeGreaterThan(0.3);
  });
});

describe('combine', () => {
  it('adds layers by a soft maximum that never passes one', () => {
    expect(combine([0.5, 0.5])).toBeCloseTo(0.75);
    expect(combine([1, 0.7])).toBe(1);
    expect(combine([0.4])).toBeCloseTo(0.4);
  });
});

describe('every emotion has a face', () => {
  it.each(EMOTIONS)('%s grows continuously, shows at 0.2 and never leaves the range', (e) => {
    let last = 0;
    for (let i = 0; i <= 20; i += 1) {
      const w = of({ [e]: i / 20 }).weights;
      for (const v of Object.values(w)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      const sum = total(w);
      expect(sum).toBeGreaterThanOrEqual(last - 1e-9);
      expect(sum - last).toBeLessThan(1.5);
      last = sum;
    }
    expect(total(of({ [e]: 0.2 }).weights)).toBeGreaterThan(0.4);
    expect(total(of({ [e]: 1 }).weights)).toBeGreaterThan(2);
  });

  it('is neutral with no feeling and a neutral mood', () => {
    const x = of({});
    expect(total(x.weights)).toBe(0);
    expect(x.head).toEqual([0, 0, 0]);
    expect(x.blink).toBe(1);
    expect(x.shine).toBe(1);
  });

  it('shows anger as a hard stare: drawn brows, tight lids, a wrinkled nose, head down', () => {
    const x = of({ anger: 0.8 });
    expect(x.weights.browDownLeft).toBeGreaterThan(0.6);
    expect(x.weights.browLateralL).toBeGreaterThan(0.3);
    expect(x.weights.eyeLowerLidUpL).toBeGreaterThan(0.3);
    expect(x.weights.noseWrinkleL).toBeGreaterThan(0.3);
    expect(x.weights.mouthSmileLeft ?? 0).toBe(0);
    expect(x.head[0]).toBeGreaterThan(0.05);
    expect(x.gaze[1]).toBeLessThan(0);
    expect(x.blink).toBeLessThan(1);
  });

  it('presses her lips in cold anger and bares her clenched teeth in strong anger', () => {
    const cold = of({ anger: 0.35 }).weights;
    const strong = of({ anger: 1 }).weights;
    expect(cold.mouthPressUL).toBeGreaterThan(0.25);
    expect(cold.mouthUpperLipRaiseL ?? 0).toBe(0);
    expect(strong.mouthUpperLipRaiseL).toBeGreaterThan(0.6);
    expect(strong.mouthLowerLipDepressL).toBeGreaterThan(0.5);
    expect(strong.mouthPressUL ?? 0).toBeLessThan(0.05);
    expect(strong.jawOpen ?? 0).toBe(0);
  });

  it('shows anger from its first quarter in the lids, the lips and the furrow', () => {
    const x = of({ anger: 0.2 }).weights;
    expect(x.eyeLowerLidUpL).toBeGreaterThan(0.2);
    expect(x.mouthPressUL).toBeGreaterThan(0.15);
    expect(x.browLateralL).toBeGreaterThan(0.2);
  });

  it('narrows her eyes in resentment and dims them in disappointment', () => {
    const resentment = of({ injustice: 0.8 }).weights;
    expect(resentment.eyeRelaxL).toBeGreaterThan(0.3);
    expect(resentment.eyeSquintInnerL).toBeGreaterThan(0.2);
    expect(resentment.eyeUpperLidUpL ?? 0).toBe(0);
    expect(resentment.mouthSmileLeft ?? 0).toBe(0);
    expect(resentment.mouthSharpCornerPullL ?? 0).toBe(0);
    expect(resentment.mouthFrownLeft).toBeGreaterThan(0.3);
    expect(of({ disappointment: 0.8 }).weights.eyeRelaxL).toBeGreaterThan(0.3);
  });

  it('keeps lowering her head in shame up to the strongest shame, without a smile', () => {
    expect(of({ shame: 1 }).head[0] - of({ shame: 0.7 }).head[0]).toBeGreaterThan(0.04);
    expect(of({ shame: 1 }).head[0]).toBeLessThan(0.2);
    expect(of({ shame: 1 }).weights.mouthSmileLeft ?? 0).toBe(0);
  });

  it('smiles in joy with her eyes, cheeks and dimples and only parts her lips', () => {
    const x = of({ joy: 1 });
    expect(x.weights.mouthSmileLeft).toBeGreaterThan(0.7);
    expect(x.weights.cheekSquintLeft).toBeGreaterThan(0.4);
    expect(x.weights.mouthDimpleLeft).toBeGreaterThan(0.3);
    expect(x.weights.jawOpen ?? 0).toBeLessThanOrEqual(0.1);
    expect(x.weights.mouthUpperUpLeft ?? 0).toBeLessThanOrEqual(0.1);
  });

  it('lowers her head and gaze in shame and lifts her head in pride', () => {
    expect(of({ shame: 0.8 }).head[0]).toBeGreaterThan(0.1);
    expect(of({ shame: 0.8 }).gaze[1]).toBeGreaterThan(0.2);
    expect(of({ pride: 0.8 }).head[0]).toBeLessThan(-0.08);
  });

  it('gives every emotion a face of its own', () => {
    const keys = EMOTIONS.map((e) =>
      Object.entries(EMOTION_FACES[e].weights)
        .sort((a, b) => b[1][0] - a[1][0])
        .slice(0, 3)
        .map(([n]) => n)
        .join(),
    );
    expect(new Set(keys).size).toBe(EMOTIONS.length);
  });
});

describe('the shine of her eyes', () => {
  it('brightens with joy and hope and dims with sad feelings, continuously', () => {
    expect(of({ joy: 0.8 }).shine).toBeGreaterThan(1.15);
    expect(of({ hope: 0.8 }).shine).toBeGreaterThan(1.1);
    expect(of({ distress: 0.8 }).shine).toBeLessThan(0.6);
    expect(of({ disappointment: 0.8 }).shine).toBeLessThan(0.65);
    expect(of({ shame: 0.4 }).shine).toBeGreaterThan(of({ shame: 0.8 }).shine);
  });
});

describe('blends', () => {
  it('keeps both emotions of a blend visible', () => {
    const both = of({ anger: 0.6, fear: 0.6 }).weights;
    expect(both.browLateralL).toBeGreaterThan(0.2);
    expect(both.mouthStretchLeft).toBeGreaterThan(0.2);
  });

  it('lets the stronger of a smile and a frown win smoothly', () => {
    const happy = of({ joy: 0.9, distress: 0.3 }).weights;
    const sad = of({ joy: 0.3, distress: 0.9 }).weights;
    expect(happy.mouthSmileLeft!).toBeGreaterThan(happy.mouthFrownLeft ?? 0);
    expect(sad.mouthFrownLeft!).toBeGreaterThan(sad.mouthSmileLeft ?? 0);
  });
});

describe('mood as her temperament', () => {
  it('shows a hostile mood as a hard face and a pleasant one as a soft smile', () => {
    const hostile = of({}, [-0.6, 0.5, 0.7]).weights;
    const warm = of({}, [0.7, 0, 0]).weights;
    expect(hostile.mouthFrownLeft).toBeGreaterThan(0.1);
    expect(hostile.jawChinRaiseDL).toBeGreaterThan(0.1);
    expect(hostile.mouthSmileLeft ?? 0).toBe(0);
    expect(warm.mouthSmileLeft).toBeGreaterThan(0.2);
  });

  it('stays quieter than an emotion', () => {
    expect(total(of({}, [-1, 1, 1]).weights)).toBeLessThan(total(of({ anger: 1 }).weights));
  });

  it('raises her head when dominant and lowers it when submissive', () => {
    expect(of({}, [0, 0, 0.8]).head[0]).toBeLessThan(0);
    expect(of({}, [0, 0, -0.8]).head[0]).toBeGreaterThan(0);
  });
});

describe('mask', () => {
  const masked = (levels: Partial<Record<Emotion, number>>, mask: number) =>
    expressionOf({ ...feelings(levels), mask });

  it('hides the mouth more than the brows', () => {
    const open = masked({ distress: 0.5 }, 0).weights;
    const hidden = masked({ distress: 0.5 }, 0.8).weights;
    const mouth = hidden.mouthFrownLeft! / open.mouthFrownLeft!;
    const brows = hidden.browRaiseInL! / open.browRaiseInL!;
    expect(mouth).toBeLessThan(brows);
  });

  it('leaks a strong feeling more than a mild one', () => {
    const share = (i: number) =>
      masked({ anger: i }, 0.9).weights.browDownLeft! /
      masked({ anger: i }, 0).weights.browDownLeft!;
    expect(share(1)).toBeGreaterThan(share(0.3));
  });

  it('shows the effort of hiding a strong feeling as pressed lips', () => {
    expect(masked({ fear: 0.9 }, 0.9).weights.mouthLipsPressL).toBeGreaterThan(
      masked({ fear: 0.9 }, 0).weights.mouthLipsPressL ?? 0,
    );
  });

  it('shows the acted face behind a full mask', () => {
    const acting = expressionOf({ ...feelings({ fear: 0.6 }), mask: 1, acted: [0.2, 0, 0.6] });
    expect(acting.head[0]).toBeLessThan(0);
    expect(acting.weights.mouthSmileLeft).toBeGreaterThan(0.05);
  });
});

describe('expressiveness', () => {
  it('shows less of the same feeling on a reserved face, in the same shape', () => {
    const loud = expressionOf({ ...feelings({ anger: 0.5 }), expressiveness: 1.3 }).weights;
    const quiet = expressionOf({ ...feelings({ anger: 0.5 }), expressiveness: 0.6 }).weights;
    expect(quiet.browDownLeft!).toBeLessThan(loud.browDownLeft!);
    expect(Object.keys(quiet).length).toBeGreaterThan(3);
  });
});
