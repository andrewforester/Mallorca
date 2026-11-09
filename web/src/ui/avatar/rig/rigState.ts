import * as THREE from 'three';
import type { Angles, Pose } from '../motion.ts';
import type { RigHeader } from './assets.ts';
import type { HeldJoint } from './bodyBones.ts';
import { addBodyBones, heldJoints, hold, keep } from './bodyBones.ts';
import type { Mapping } from './controls.ts';
import { controlsOf } from './controls.ts';
import { jointTransform } from './joints.ts';
import type { Rig } from './riglogic.ts';

export interface RigData {
  header: Pick<RigHeader, 'controls' | 'joints' | 'parents' | 'body' | 'pose'>;
  mapping: Mapping;
}

export interface RigFrame {
  blends: Float32Array;
  maps: Float32Array;
  lids: [number, number];
}

const CM = 0.01;
const LIFT_CM_PER_RAD = 16;
const SHOULDERS = ['clavicle_l', 'clavicle_r'] as const;
const POSED = ['head', 'neck_01', 'neck_02', 'spine_05', 'clavicle_l', 'clavicle_r'] as const;
type Posed = (typeof POSED)[number];

const LIDS = ['FACIAL_L_EyelidUpperB', 'FACIAL_R_EyelidUpperB'] as const;
const LID_CLOSED = (19 * Math.PI) / 180;

const half = ([x, y, z]: Angles): Angles => [x / 2, y / 2, z / 2];

function poseAngles(pose: Pose): Record<Posed, Angles> {
  return {
    head: pose.head,
    neck_01: half(pose.neck),
    neck_02: half(pose.neck),
    spine_05: pose.spine,
    clavicle_l: [0, 0, pose.shoulder],
    clavicle_r: [0, 0, -pose.shoulder],
  };
}

export class RigState {
  readonly root = new THREE.Group();
  readonly bones: THREE.Bone[];
  private readonly rig: Rig;
  private readonly neutral: Float32Array;
  private readonly frozen: boolean[];
  private readonly controls: Float32Array;
  private readonly space: { mapping: Mapping; index: Map<string, number> };
  private readonly rest = new Map<Posed, THREE.Quaternion>();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly turn = new THREE.Quaternion();
  private readonly local = new THREE.Quaternion();
  private readonly lidBones: { bone: THREE.Bone; open: THREE.Quaternion }[] = [];
  private readonly held: HeldJoint[];
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly lifted: THREE.Bone[];

  constructor({ header, mapping }: RigData, rig: Rig) {
    this.rig = rig;
    this.root.scale.setScalar(CM);
    this.neutral = rig.neutral();
    this.controls = new Float32Array(rig.controlCount);
    this.space = { mapping, index: new Map(header.controls.map((c, i) => [c, i])) };
    this.frozen = header.joints.map((n) => /neck/i.test(n));
    this.bones = header.joints.map((name) => Object.assign(new THREE.Bone(), { name }));
    header.parents.forEach((p, j) => {
      (p === j ? this.root : this.bones[p]!).add(this.bones[j]!);
      jointTransform(this.neutral, null, j, this.bones[j]!);
    });
    if (header.body) this.bones.push(...addBodyBones(header.body, this.root, this.bones));
    this.held = heldJoints(header.pose?.sitting ?? {}, this.bones);
    const restore = keep(this.held);
    hold(this.held);
    this.root.updateMatrixWorld(true);
    for (const name of POSED) {
      const b = this.bones[header.joints.indexOf(name)];
      if (b) this.rest.set(name, b.getWorldQuaternion(new THREE.Quaternion()));
    }
    restore();
    this.root.updateMatrixWorld(true);
    const chest = this.rest.get('spine_05');
    if (chest) this.up.applyQuaternion(chest.clone().invert());
    this.lifted = SHOULDERS.map((n) => this.bone(n)).filter((b) => b !== undefined);
    for (const name of LIDS) {
      const bone = this.bone(name)!;
      this.lidBones.push({ bone, open: bone.quaternion.clone() });
    }
  }

  bone(name: string): THREE.Bone | undefined {
    return this.bones.find((b) => b.name === name);
  }

  update(pose: Pose): RigFrame {
    controlsOf(pose.weights, pose.eyes, this.space, this.controls);
    this.controls.forEach((v, i) => this.rig.set(i, v));
    this.rig.calculate();
    const joints = this.rig.joints();
    this.bones.forEach((b, j) => {
      if (j < this.frozen.length)
        jointTransform(this.neutral, this.frozen[j] ? null : joints, j, b);
    });
    hold(this.held);
    this.applyPose(poseAngles(pose));
    for (const b of this.lifted)
      b.position.addScaledVector(this.up, LIFT_CM_PER_RAD * pose.shoulder);
    return { blends: this.rig.blends(), maps: this.rig.maps(), lids: this.lids() };
  }

  private lids(): [number, number] {
    const [l, r] = this.lidBones.map(({ bone, open }) =>
      Math.min(1, bone.quaternion.angleTo(open) / LID_CLOSED),
    );
    return [l!, r!];
  }

  private applyPose(angles: Record<Posed, Angles>): void {
    for (const [name, rest] of this.rest) {
      const [pitch, yaw, roll] = angles[name];
      this.turn.setFromEuler(this.euler.set(pitch, yaw, roll, 'YXZ'));
      this.local.copy(rest).invert().multiply(this.turn).multiply(rest);
      this.bone(name)?.quaternion.multiply(this.local);
    }
  }
}
