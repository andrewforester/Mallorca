import * as THREE from 'three';
import type { MeshSection } from './assets.ts';
import { decode } from './assets.ts';
import type { Target } from './blend.ts';

export interface MeshData {
  geometry: THREE.BufferGeometry;
  base: Float32Array;
  targets: Target[];
  follow: ArrayLike<number> | null;
}

const INFLUENCES = 12;
const SKIN_SETS = [
  ['skinIndex', 'skinWeight'],
  ['skinIndex1', 'skinWeight1'],
  ['skinIndex2', 'skinWeight2'],
] as const;

function pick(src: ArrayLike<number>, set: number): Float32Array {
  const n = src.length / INFLUENCES;
  const out = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    for (let c = 0; c < 4; c++) out[v * 4 + c] = src[v * INFLUENCES + set * 4 + c]!;
  }
  return out;
}

function normalized(weights: ArrayLike<number>): Float32Array {
  const out = Float32Array.from(weights);
  for (let o = 0; o < out.length; o += INFLUENCES) {
    let sum = 0;
    for (let c = 0; c < INFLUENCES; c++) sum += out[o + c]!;
    for (let c = 0; sum > 0 && c < INFLUENCES; c++) out[o + c] = out[o + c]! / sum;
  }
  return out;
}

export function meshGeometry(bin: ArrayBuffer, mesh: MeshSection): MeshData {
  const geometry = new THREE.BufferGeometry();
  const base = decode(bin, mesh.position) as Float32Array;
  const position = new THREE.BufferAttribute(base.slice(), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  const normal = new THREE.BufferAttribute(decode(bin, mesh.normal), 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  geometry.setAttribute('normal', normal);
  geometry.setAttribute('uv', new THREE.BufferAttribute(decode(bin, mesh.uv), 2));
  geometry.setIndex(new THREE.BufferAttribute(decode(bin, mesh.index), 1));
  const skinIndex = decode(bin, mesh.skinIndex);
  const skinWeight = normalized(decode(bin, mesh.skinWeight));
  SKIN_SETS.forEach(([index, weight], set) => {
    geometry.setAttribute(index, new THREE.BufferAttribute(pick(skinIndex, set), 4));
    geometry.setAttribute(weight, new THREE.BufferAttribute(pick(skinWeight, set), 4));
  });
  const targets = mesh.targets.map((t) => ({
    channel: t.channel,
    index: decode(bin, t.index),
    delta: decode(bin, t.delta),
  }));
  const follow = mesh.follow ? decode(bin, mesh.follow) : null;
  return { geometry, base, targets, follow };
}
