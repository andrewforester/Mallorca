import * as THREE from 'three';
import { plain } from './skin.ts';

export const SWEATER = 0x9c6a1c;

export function fabricMaterial(knit: THREE.Texture): THREE.MeshPhysicalMaterial {
  knit.wrapS = THREE.RepeatWrapping;
  knit.wrapT = THREE.RepeatWrapping;
  return plain({
    color: SWEATER,
    normalMap: knit,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.92,
    sheen: 0.5,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0xd9a850),
    side: THREE.DoubleSide,
  });
}
