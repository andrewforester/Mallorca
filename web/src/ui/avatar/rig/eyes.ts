import * as THREE from 'three';
import { skin12 } from './skin.ts';

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function occlusion(u: number, v: number): number {
  const lid = 0.42 * smoothstep(0.52, 0.64, v);
  const inner = 0.3 * (1 - smoothstep(0.18, 0.3, u));
  const outer = 0.25 * smoothstep(0.58, 0.72, u);
  return Math.min(0.6, 0.04 + lid + inner + outer);
}

export function occlusionMap(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = Math.round(255 * occlusion((x + 0.5) / size, (y + 0.5) / size));
      data.set([a, a, a, 255], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const IRIS_LIFT = 0.6;
const LIMBUS_DEPTH = 0.3;

const IRIS = `#include <map_fragment>
float irisR = distance(vMapUv, vec2(0.5));
float iris = 1.0 - smoothstep(0.13, 0.147, irisR);
float pupil = 1.0 - smoothstep(0.04, 0.05, irisR);
float limbus = smoothstep(0.125, 0.145, irisR) * (1.0 - smoothstep(0.15, 0.175, irisR));
diffuseColor.rgb *= 1.0 + ${IRIS_LIFT.toFixed(2)} * iris * (1.0 - pupil);
diffuseColor.rgb *= 1.0 - ${LIMBUS_DEPTH.toFixed(2)} * limbus;`;

export function eyeMaterial(map: THREE.Texture, normalMap: THREE.Texture): THREE.Material {
  const material = new THREE.MeshPhysicalMaterial({
    map,
    normalMap,
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
  });
  material.onBeforeCompile = (shader) => {
    skin12(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', IRIS);
  };
  return material;
}
