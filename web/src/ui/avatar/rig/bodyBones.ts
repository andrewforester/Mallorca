import * as THREE from 'three';
import type { BodySkeleton } from './assets.ts';
import { jointTransform } from './joints.ts';

export interface HeldJoint {
  bone: THREE.Bone;
  row: Float32Array;
}

const rowOf = (values: number[]): Float32Array =>
  new Float32Array([...values.slice(0, 6), 1, 1, 1]);

export function addBodyBones(
  body: BodySkeleton,
  root: THREE.Object3D,
  bones: THREE.Bone[],
): THREE.Bone[] {
  const byName = new Map(bones.map((b) => [b.name, b]));
  const added = body.joints.map((name, j) => {
    const bone = Object.assign(new THREE.Bone(), { name });
    jointTransform(rowOf(body.rest[j]!), null, 0, bone);
    byName.set(name, bone);
    return bone;
  });
  body.parents.forEach((parent, j) => (byName.get(parent) ?? root).add(added[j]!));
  return added;
}

export function heldJoints(sitting: Record<string, number[]>, bones: THREE.Bone[]): HeldJoint[] {
  return bones
    .filter((bone) => bone.name in sitting)
    .map((bone) => ({ bone, row: rowOf(sitting[bone.name]!) }));
}

export function hold(joints: HeldJoint[]): void {
  for (const { bone, row } of joints) jointTransform(row, null, 0, bone);
}
