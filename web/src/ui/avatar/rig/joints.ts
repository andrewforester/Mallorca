import * as THREE from 'three';

export interface JointTarget {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

const euler = new THREE.Euler(0, 0, 0, 'ZYX');
const RAD = Math.PI / 180;

export function jointTransform(
  base: Float32Array,
  delta: Float32Array | null,
  j: number,
  out: JointTarget,
): void {
  const o = j * 9;
  const v = (k: number) => base[o + k]! + (delta ? delta[o + k]! : 0);
  out.position.set(v(0), v(1), v(2));
  euler.set(v(3) * RAD, v(4) * RAD, v(5) * RAD, 'ZYX');
  out.quaternion.setFromEuler(euler);
  out.scale.set(v(6), v(7), v(8));
}
