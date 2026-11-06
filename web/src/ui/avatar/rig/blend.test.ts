import { describe, expect, it } from 'vitest';
import { NormalTracker, applyBlends, followHead } from './blend.ts';

describe('applyBlends', () => {
  it('adds each target delta times its channel weight to the rest positions', () => {
    const base = new Float32Array([0, 0, 0, 1, 1, 1]);
    const out = new Float32Array(6);
    const target = { channel: 1, index: new Uint16Array([1]), delta: new Float32Array([2, 0, -2]) };
    applyBlends(base, [target], new Float32Array([0, 0.5]), out);
    expect([...out]).toEqual([0, 0, 0, 2, 1, 0]);
  });

  it('skips a target whose weight is zero', () => {
    const out = new Float32Array(3);
    const target = { channel: 0, index: new Uint16Array([0]), delta: new Float32Array([1, 1, 1]) };
    applyBlends(new Float32Array(3), [target], new Float32Array([0]), out);
    expect([...out]).toEqual([0, 0, 0]);
  });
});

describe('followHead', () => {
  it('moves a card vertex by the offset of the head vertex it follows', () => {
    const headBase = new Float32Array([0, 0, 0, 5, 5, 5]);
    const head = new Float32Array([0, 0, 0, 5, 6, 5]);
    const cards = new Float32Array([10, 10, 10]);
    const out = new Float32Array(3);
    followHead({ now: head, base: headBase }, new Uint32Array([1]), cards, out);
    expect([...out]).toEqual([10, 11, 10]);
  });
});

describe('NormalTracker', () => {
  it('keeps the authored normals at rest and turns them with the surface', () => {
    const flat = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]);
    const index = new Uint16Array([0, 1, 2, 2, 1, 3]);
    const authored = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const tracker = new NormalTracker(authored, flat, index);
    const out = new Float32Array(12);
    tracker.update(flat, out);
    expect([...out.slice(0, 3)]).toEqual([0, 0, 1]);
    const tilted = new Float32Array([0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1]);
    tracker.update(tilted, out);
    expect(out[0]).toBeCloseTo(-Math.SQRT1_2);
    expect(out[2]).toBeCloseTo(Math.SQRT1_2);
  });
});
