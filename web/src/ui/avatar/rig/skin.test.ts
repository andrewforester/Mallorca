import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { WrinkleLayout } from './skin.ts';
import { mouthMaterial, skinMaterial } from './skin.ts';

function compiled(material: THREE.Material): string {
  const shader = {
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    uniforms: {},
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader.fragmentShader;
}

describe('mouthMaterial', () => {
  it('shades the lit color of the deep mouth, highlights included', () => {
    const fragment = compiled(mouthMaterial(new THREE.Texture(), new THREE.Texture()));
    const shade = fragment.indexOf('outgoingLight *= mouthShade;');
    expect(shade).toBeGreaterThan(fragment.indexOf('float mouthShade'));
    expect(shade).toBeLessThan(fragment.indexOf('#include <opaque_fragment>'));
  });
});

describe('skinMaterial', () => {
  it('lifts the lid fold without normalizing a vanishing blend', () => {
    const layout: WrinkleLayout = {
      masks: new THREE.DataArrayTexture(),
      count: 1,
      weights: [new THREE.Vector3()],
      lids: new THREE.Vector2(),
      eye: new THREE.Vector2(),
    };
    const t = () => new THREE.Texture();
    const material = skinMaterial(
      { color: t(), normal: t(), roughness: t(), wrinkles: [t(), t(), t()] },
      layout,
    );
    const fragment = compiled(material);
    expect(fragment).toContain('dot(lidMix, lidUp) > 0.05 ? normalize(lidMix) : lidUp');
  });
});
