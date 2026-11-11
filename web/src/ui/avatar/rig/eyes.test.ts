import { describe, expect, it } from 'vitest';
import { eyeShineOf, occlusion, occlusionMap } from './eyes.ts';

describe('occlusion', () => {
  it('leaves the middle of the eye almost clear', () => {
    expect(occlusion(0.45, 0.5)).toBeLessThan(0.1);
  });

  it('shades the eye under the upper lid', () => {
    expect(occlusion(0.45, 0.62)).toBeGreaterThan(0.3);
  });

  it('shades both corners more than the middle', () => {
    const middle = occlusion(0.45, 0.5);
    expect(occlusion(0.17, 0.5)).toBeGreaterThan(middle + 0.15);
    expect(occlusion(0.7, 0.5)).toBeGreaterThan(middle + 0.15);
  });

  it('stays within the opacity range', () => {
    for (let u = 0; u <= 1; u += 0.05) {
      for (let v = 0; v <= 1; v += 0.05) {
        expect(occlusion(u, v)).toBeGreaterThanOrEqual(0);
        expect(occlusion(u, v)).toBeLessThanOrEqual(0.6);
      }
    }
  });
});

describe('occlusionMap', () => {
  it('stores the occlusion in the green channel, v along the rows', () => {
    const map = occlusionMap(64);
    const data = map.image.data as Uint8Array;
    const at = (u: number, v: number) =>
      data[(Math.floor(v * 64) * 64 + Math.floor(u * 64)) * 4 + 1]! / 255;
    expect(at(0.45, 0.62)).toBeCloseTo(occlusion(0.45 + 0.5 / 64, 0.62 + 0.5 / 64), 1);
    expect(at(0.45, 0.5)).toBeLessThan(0.1);
  });
});

describe('eyeShineOf', () => {
  it('keeps the wet glossy eye of today at a neutral shine', () => {
    expect(eyeShineOf(1)).toEqual({
      roughness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      irisLift: 0.6,
    });
  });

  it('dulls the eye and darkens the iris as the shine falls, never dropping the clearcoat', () => {
    const dull = eyeShineOf(0.4);
    expect(dull.roughness).toBeGreaterThan(0.2);
    expect(dull.clearcoat).toBeLessThan(0.3);
    expect(dull.clearcoat).toBeGreaterThanOrEqual(0.1);
    expect(dull.irisLift).toBeLessThan(0.3);
    expect(eyeShineOf(0).clearcoat).toBeGreaterThanOrEqual(0.1);
  });

  it('lights the iris a little more above neutral', () => {
    expect(eyeShineOf(1.3).irisLift).toBeGreaterThan(0.6);
    expect(eyeShineOf(1.3).irisLift).toBeLessThanOrEqual(0.85);
  });
});
