interface Exports {
  memory: WebAssembly.Memory;
  _initialize: () => void;
  rl_alloc: (size: number) => number;
  rl_load: (ptr: number, size: number) => number;
  rl_joint_count: () => number;
  rl_neutral: () => number;
  rl_set: (index: number, value: number) => void;
  rl_calculate: () => void;
  rl_joints: () => number;
  rl_blend_count: () => number;
  rl_blends: () => number;
  rl_map_count: () => number;
  rl_maps: () => number;
}

export interface Rig {
  controlCount: number;
  jointCount: number;
  neutral(): Float32Array;
  set(index: number, value: number): void;
  calculate(): void;
  joints(): Float32Array;
  blends(): Float32Array;
  maps(): Float32Array;
}

export async function createRig(wasm: BufferSource, dna: Uint8Array): Promise<Rig> {
  const imports = { env: { emscripten_notify_memory_growth: () => undefined } };
  const { instance } = await WebAssembly.instantiate(wasm, imports);
  const x = instance.exports as unknown as Exports;
  x._initialize();
  const ptr = x.rl_alloc(dna.byteLength);
  new Uint8Array(x.memory.buffer, ptr, dna.byteLength).set(dna);
  const controlCount = x.rl_load(ptr, dna.byteLength);
  const outputs = x.rl_joint_count();
  const view = (at: number, length: number) => new Float32Array(x.memory.buffer, at, length);
  return {
    controlCount,
    jointCount: outputs / 9,
    neutral: () => view(x.rl_neutral(), outputs).slice(),
    set: (index, value) => x.rl_set(index, value),
    calculate: () => x.rl_calculate(),
    joints: () => view(x.rl_joints(), outputs),
    blends: () => view(x.rl_blends(), x.rl_blend_count()),
    maps: () => view(x.rl_maps(), x.rl_map_count()),
  };
}
