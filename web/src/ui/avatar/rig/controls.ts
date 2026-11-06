import type { Weights } from '../../../game/index.ts';

export type Mapping = Readonly<Record<string, Readonly<Record<string, number>>>>;

export interface ControlSpace {
  mapping: Mapping;
  index: ReadonlyMap<string, number>;
}

const YAW_FULL = 0.5;
const PITCH_FULL = 0.35;

function addMapped(
  weights: Weights,
  mapping: Mapping,
  index: ReadonlyMap<string, number>,
  out: Float32Array,
): void {
  for (const [name, w] of Object.entries(weights)) {
    const map = mapping[name];
    if (!w || !map || name.startsWith('eyeLook')) continue;
    for (const [control, gain] of Object.entries(map)) {
      const i = index.get(control);
      if (i !== undefined) out[i] = out[i]! + w * gain;
    }
  }
}

function addGaze(
  [yaw, pitch]: readonly [number, number],
  index: ReadonlyMap<string, number>,
  out: Float32Array,
): void {
  const set = (control: string, v: number) => {
    const i = index.get(control);
    if (i !== undefined) out[i] = Math.max(out[i]!, v);
  };
  for (const s of ['L', 'R']) {
    set(`eyeLookLeft${s}`, Math.max(0, yaw) / YAW_FULL);
    set(`eyeLookRight${s}`, Math.max(0, -yaw) / YAW_FULL);
    set(`eyeLookDown${s}`, Math.max(0, pitch) / PITCH_FULL);
    set(`eyeLookUp${s}`, Math.max(0, -pitch) / PITCH_FULL);
  }
}

export function controlsOf(
  weights: Weights,
  eyes: readonly [number, number],
  space: ControlSpace,
  out: Float32Array,
): void {
  out.fill(0);
  addMapped(weights, space.mapping, space.index, out);
  addGaze(eyes, space.index, out);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, out[i]!));
}
