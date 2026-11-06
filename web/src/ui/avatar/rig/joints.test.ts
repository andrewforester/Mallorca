import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { jointTransform } from './joints.ts';

const target = () => ({
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  scale: new THREE.Vector3(),
});

describe('jointTransform', () => {
  it('adds the delta to the neutral translation and scale', () => {
    const base = new Float32Array([1, 2, 3, 0, 0, 0, 1, 1, 1]);
    const delta = new Float32Array([0.5, 0, -1, 0, 0, 0, 0.1, 0, 0]);
    const out = target();
    jointTransform(base, delta, 0, out);
    expect(out.position.toArray()).toEqual([1.5, 2, 2]);
    expect(out.scale.x).toBeCloseTo(1.1);
  });

  it('reads rotations as degrees about Y that turn x toward -z', () => {
    const base = new Float32Array([0, 0, 0, 0, 90, 0, 1, 1, 1]);
    const out = target();
    jointTransform(base, null, 0, out);
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(out.quaternion);
    expect(x.z).toBeCloseTo(-1);
  });

  it('reads the joint at its own offset of nine values', () => {
    const base = new Float32Array(18);
    base.set([7, 8, 9, 0, 0, 0, 1, 1, 1], 9);
    const out = target();
    jointTransform(base, null, 1, out);
    expect(out.position.toArray()).toEqual([7, 8, 9]);
  });
});
