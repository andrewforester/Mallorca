import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mouthMaterial } from './skin.ts';

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
