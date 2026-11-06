import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Rig } from './riglogic.ts';
import { createRig } from './riglogic.ts';

const her = (file: string) => resolve('public/avatar/her', file);
const header = JSON.parse(readFileSync(her('rig.json'), 'utf8')) as {
  controls: string[];
  joints: string[];
  maps: string[];
};

let rig: Rig;
let rest: Float32Array;

beforeAll(async () => {
  rig = await createRig(
    readFileSync(resolve('src/ui/avatar/rig/riglogic.wasm')),
    new Uint8Array(readFileSync(her('behavior.dna'))),
  );
  rig.calculate();
  rest = rig.joints().slice();
});

describe('RigLogic in wasm', () => {
  it('reads her rig: one raw control per header control, nine outputs per joint', () => {
    expect(rig.controlCount).toBe(header.controls.length);
    expect(rig.joints().length).toBe(header.joints.length * 9);
    expect(rig.neutral().length).toBe(header.joints.length * 9);
    expect(rig.maps().length).toBe(header.maps.length);
  });

  it('opens the jaw when jawOpen is set', () => {
    rig.set(header.controls.indexOf('jawOpen'), 1);
    rig.calculate();
    const jaw = header.joints.indexOf('FACIAL_C_Jaw');
    const moved = rig.joints().slice(jaw * 9, jaw * 9 + 9);
    expect(Math.max(...moved.map((v, i) => Math.abs(v - rest[jaw * 9 + i]!)))).toBeGreaterThan(1);
    expect(rig.blends().length).toBeGreaterThan(0);
  });

  it('returns to rest when the control is cleared', () => {
    rig.set(header.controls.indexOf('jawOpen'), 0);
    rig.calculate();
    const now = rig.joints();
    expect(Math.max(...now.map((v, i) => Math.abs(v - rest[i]!)))).toBeLessThan(1e-5);
  });
});
