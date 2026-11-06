import type { Mapping } from './controls.ts';

type IndexType = 'uint8' | 'uint16' | 'uint32';

export interface Section {
  offset: number;
  length: number;
  type: IndexType | 'float32' | 'int16' | 'int8';
}

export interface Quantized extends Section {
  type: 'int16' | 'int8';
  scale: number[];
  offset3: number[];
}

export interface TargetSection {
  channel: number;
  index: Section;
  delta: Quantized;
}

export interface MeshSection {
  name: string;
  position: Quantized;
  normal: Quantized;
  uv: Quantized;
  index: Section;
  skinIndex: Section;
  skinWeight: Quantized;
  targets: TargetSection[];
  follow?: Section;
}

export interface RigHeader {
  controls: string[];
  joints: string[];
  parents: number[];
  maps: string[];
  masks: string[];
  maskSize: number;
  meshes: MeshSection[];
}

export interface RigAssets {
  header: RigHeader;
  bin: ArrayBuffer;
  dna: Uint8Array<ArrayBuffer>;
  masks: Uint8Array<ArrayBuffer>;
  mapping: Mapping;
}

export type Fetcher = (url: string) => Promise<Response>;

const ARRAYS = {
  uint8: Uint8Array,
  uint16: Uint16Array,
  uint32: Uint32Array,
  float32: Float32Array,
  int16: Int16Array,
  int8: Int8Array,
} as const;

const isQuantized = (s: Section | Quantized): s is Quantized => 'scale' in s;

export function decode(
  bin: ArrayBuffer,
  s: Section | Quantized,
): Float32Array | Uint32Array | Uint16Array | Uint8Array {
  const raw = new ARRAYS[s.type](bin, s.offset, s.length);
  if (!isQuantized(s)) return raw as Float32Array | Uint32Array | Uint16Array | Uint8Array;
  const k = s.scale.length;
  const out = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = raw[i]! * s.scale[i % k]! + s.offset3[i % k]!;
  return out;
}

async function fetchOk(fetcher: Fetcher, url: string): Promise<Response> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response;
}

export async function loadAssets(
  base: string,
  fetcher: Fetcher = (url) => fetch(url),
): Promise<RigAssets> {
  const get = (name: string) => fetchOk(fetcher, base + name);
  const [header, bin, dna, masks, mapping] = await Promise.all([
    get('rig.json').then((r) => r.json() as Promise<RigHeader>),
    get('rig.bin').then((r) => r.arrayBuffer()),
    get('behavior.dna').then((r) => r.arrayBuffer()),
    get('masks.r8').then((r) => r.arrayBuffer()),
    get('mapping.json').then((r) => r.json() as Promise<Mapping>),
  ]);
  return { header, bin, dna: new Uint8Array(dna), masks: new Uint8Array(masks), mapping };
}
