import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Pose } from '../motion.ts';
import type { RigHeader } from './assets.ts';
import { createRig } from './riglogic.ts';
import { RigState } from './rigState.ts';

const her = (file: string) => resolve('public/avatar/her', file);

const pose = (over: Partial<Pose> = {}): Pose => ({
  weights: {},
  eyes: [0, 0],
  head: [0, 0, 0],
  neck: [0, 0, 0],
  spine: [0, 0, 0],
  shoulder: 0,
  ...over,
});

let state: RigState;
let header: RigHeader;
let mapping: Record<string, Record<string, number>>;

const loadRig = () =>
  createRig(
    readFileSync(resolve('src/ui/avatar/rig/riglogic.wasm')),
    new Uint8Array(readFileSync(her('behavior.dna'))),
  );

beforeAll(async () => {
  header = JSON.parse(readFileSync(her('rig.json'), 'utf8')) as RigHeader;
  mapping = JSON.parse(readFileSync(her('mapping.json'), 'utf8')) as Record<
    string,
    Record<string, number>
  >;
  state = new RigState({ header, mapping }, await loadRig());
});

const bone = (name: string) => state.bones.find((b) => b.name === name)!;
const snapshot = (names: string[]) =>
  names.map((n) => [...bone(n).position.toArray(), ...bone(n).quaternion.toArray()]);

describe('RigState', () => {
  it('keeps the neck still when she blinks', () => {
    const necks = state.bones.filter((b) => /neck/i.test(b.name)).map((b) => b.name);
    expect(necks.length).toBeGreaterThan(2);
    state.update(pose());
    const still = snapshot(necks);
    state.update(pose({ weights: { eyeBlinkLeft: 1, eyeBlinkRight: 1, jawOpen: 1 } }));
    snapshot(necks).forEach((row, i) =>
      row.forEach((v, k) => expect(v).toBeCloseTo(still[i]![k]!, 5)),
    );
  });

  it('opens the jaw for jawOpen', () => {
    state.update(pose());
    const rest = bone('FACIAL_C_Jaw').quaternion.clone();
    state.update(pose({ weights: { jawOpen: 1 } }));
    expect(bone('FACIAL_C_Jaw').quaternion.angleTo(rest)).toBeGreaterThan(0.1);
  });

  it('turns her head toward her left for a positive yaw', () => {
    const world = () => {
      state.root.updateMatrixWorld(true);
      return bone('head').getWorldQuaternion(new THREE.Quaternion());
    };
    state.update(pose());
    const nose = new THREE.Vector3(0, 0, 1).applyQuaternion(world().invert());
    state.update(pose({ head: [0, 0.3, 0] }));
    const after = nose.clone().applyQuaternion(world());
    expect(after.x).toBeCloseTo(Math.sin(0.3), 2);
  });

  it('measures each upper lid from open to closed', () => {
    expect(state.update(pose()).lids).toEqual([0, 0]);
    const [left, right] = state.update(
      pose({ weights: { eyeBlinkLeft: 1, eyeBlinkRight: 0.5 } }),
    ).lids;
    expect(left).toBeGreaterThan(0.9);
    expect(right).toBeGreaterThan(0.3);
    expect(right).toBeLessThan(0.7);
  });

  it('lowers the lids when she looks down and keeps them open when she looks up', () => {
    const down = state.update(pose({ eyes: [0, 0.3] })).lids;
    down.forEach((v) => expect(v).toBeGreaterThan(0.3));
    const up = state.update(pose({ eyes: [0, -0.3] })).lids;
    up.forEach((v) => expect(v).toBeLessThan(0.1));
  });

  it('returns blendshape and wrinkle map weights for her rig', () => {
    const out = state.update(pose({ weights: { browDownLeft: 1 } }));
    expect(out.blends.some((w) => w > 0)).toBe(true);
    expect(out.maps.some((w) => w > 0)).toBe(true);
  });

  it('builds her body bones after the face bones', () => {
    const body = header.body!;
    expect(state.bones).toHaveLength(header.joints.length + body.joints.length);
    expect(state.bones[header.joints.length]!.name).toBe(body.joints[0]);
    expect(bone('lowerarm_l').parent).toBe(bone('upperarm_l'));
    expect(bone('pelvis').parent).toBe(bone('root'));
    expect(bone('root').parent).toBe(state.root);
  });

  it('holds her arms in the seated pose', () => {
    state.update(pose());
    for (const name of ['upperarm_l', 'lowerarm_r', 'upperarm_out_l']) {
      const [, , , rx, ry, rz] = header.pose!.sitting[name]!;
      const deg = Math.PI / 180;
      const want = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rx! * deg, ry! * deg, rz! * deg, 'ZYX'),
      );
      expect(bone(name).quaternion.angleTo(want)).toBeLessThan(1e-5);
    }
  });

  it('keeps her body still when she blinks or opens her jaw', () => {
    const names = [...header.body!.joints, 'upperarm_l', 'upperarm_r'];
    state.update(pose());
    const still = snapshot(names);
    state.update(pose({ weights: { eyeBlinkLeft: 1, eyeBlinkRight: 1, jawOpen: 1 } }));
    snapshot(names).forEach((row, i) =>
      row.forEach((v, k) => expect(v).toBeCloseTo(still[i]![k]!, 5)),
    );
  });

  it('lowers her shoulders with Pose.shoulder on top of the seated pose', () => {
    const world = () => {
      state.root.updateMatrixWorld(true);
      return bone('clavicle_l').getWorldQuaternion(new THREE.Quaternion());
    };
    state.update(pose());
    const seated = world();
    state.update(pose({ shoulder: 0.1 }));
    expect(world().angleTo(seated)).toBeCloseTo(0.1, 3);
  });

  it('loads a header without a body as before', async () => {
    const face = { ...header, body: undefined, pose: undefined };
    const old = new RigState({ header: face, mapping }, await loadRig());
    expect(old.bones).toHaveLength(header.joints.length);
    old.update(pose());
    const rest = old.bone('FACIAL_C_Jaw')!.quaternion.clone();
    old.update(pose({ weights: { jawOpen: 1 } }));
    expect(old.bone('FACIAL_C_Jaw')!.quaternion.angleTo(rest)).toBeGreaterThan(0.1);
  });
});
