import { describe, expect, it } from 'vitest';
import { controlsOf } from './controls.ts';

const NAMES = [
  'jawOpen',
  'mouthCornerPullL',
  'eyeLookLeftL',
  'eyeLookLeftR',
  'eyeLookDownL',
  'eyeLookUpL',
  'jawChinRaiseDL',
];
const INDEX = new Map(NAMES.map((n, i) => [n, i]));
const MAPPING = {
  jawOpen: { jawOpen: 1 },
  mouthSmileLeft: { mouthCornerPullL: 0.5 },
  eyeLookUpLeft: { eyeLookUpL: 1 },
};

const at = (name: string) => NAMES.indexOf(name);

const run = (weights: Record<string, number>, eyes: [number, number] = [0, 0]) => {
  const out = new Float32Array(NAMES.length);
  controlsOf(weights, eyes, { mapping: MAPPING, index: INDEX }, out);
  return out;
};

describe('controlsOf', () => {
  it('clamps a weight above 1 to the full control', () => {
    expect(run({ jawOpen: 1.4 })[at('jawOpen')]).toBe(1);
  });

  it('softly limits a control that breaks the face beyond its range', () => {
    const raise = (w: number) => run({ jawChinRaiseDL: w })[at('jawChinRaiseDL')]!;
    expect(raise(0.1)).toBeCloseTo(0.1, 1);
    expect(raise(1)).toBeLessThan(0.3);
    expect(raise(1)).toBeGreaterThan(raise(0.5));
  });

  it('scales a weight by its mapping gain', () => {
    expect(run({ mouthSmileLeft: 0.6 })[at('mouthCornerPullL')]).toBeCloseTo(0.3);
  });

  it('drives a rig control named directly by its own name', () => {
    expect(run({ mouthCornerPullL: 0.4 })[at('mouthCornerPullL')]).toBeCloseTo(0.4);
    expect(run({ mouthCornerPullL: 0.4, mouthSmileLeft: 0.6 })[at('mouthCornerPullL')]).toBeCloseTo(
      0.7,
    );
  });

  it('ignores a name with no mapping', () => {
    expect([...run({ unknownName: 1 })]).toEqual(new Array(NAMES.length).fill(0));
  });

  it('turns both eyes toward a positive yaw', () => {
    const out = run({}, [0.25, 0]);
    expect(out[2]).toBeCloseTo(0.5);
    expect(out[3]).toBeCloseTo(0.5);
  });

  it('looks down for a positive pitch and leaves eyeLook weights to the gaze', () => {
    const out = run({ eyeLookUpLeft: 1 }, [0, 0.175]);
    expect(out[4]).toBeCloseTo(0.5);
    expect(out[5]).toBe(0);
  });

  it('clears the previous frame', () => {
    const out = new Float32Array(NAMES.length).fill(0.7);
    controlsOf({}, [0, 0], { mapping: MAPPING, index: INDEX }, out);
    expect(out[0]).toBe(0);
  });
});
