import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SWEATER, fabricMaterial } from './fabric.ts';

describe('fabricMaterial', () => {
  it('knits her sweater in mustard with a tiling stitch on both sides', () => {
    const knit = new THREE.Texture();
    const material = fabricMaterial(knit);
    expect(material.color.getHexString()).toBe(new THREE.Color(SWEATER).getHexString());
    expect(SWEATER).toBe(0x9c6a1c);
    expect(material.normalMap).toBe(knit);
    expect(knit.wrapS).toBe(THREE.RepeatWrapping);
    expect(knit.wrapT).toBe(THREE.RepeatWrapping);
    expect(material.side).toBe(THREE.DoubleSide);
    expect(material.sheen).toBeGreaterThan(0);
  });
});
