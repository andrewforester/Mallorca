export interface Target {
  channel: number;
  index: ArrayLike<number>;
  delta: ArrayLike<number>;
}

export function applyBlends(
  base: Float32Array,
  targets: readonly Target[],
  blends: Float32Array,
  out: Float32Array,
): void {
  out.set(base);
  for (const { channel, index, delta } of targets) {
    const w = blends[channel] ?? 0;
    if (w === 0) continue;
    for (let k = 0; k < index.length; k++) {
      const o = index[k]! * 3;
      out[o] = out[o]! + w * delta[k * 3]!;
      out[o + 1] = out[o + 1]! + w * delta[k * 3 + 1]!;
      out[o + 2] = out[o + 2]! + w * delta[k * 3 + 2]!;
    }
  }
}

export interface HeadFrame {
  now: Float32Array;
  base: Float32Array;
}

export function followHead(
  { now: head, base: headBase }: HeadFrame,
  follow: ArrayLike<number>,
  base: Float32Array,
  out: Float32Array,
): void {
  for (let k = 0; k < follow.length; k++) {
    const h = follow[k]! * 3;
    const o = k * 3;
    out[o] = base[o]! + head[h]! - headBase[h]!;
    out[o + 1] = base[o + 1]! + head[h + 1]! - headBase[h + 1]!;
    out[o + 2] = base[o + 2]! + head[h + 2]! - headBase[h + 2]!;
  }
}

function accumulate(
  pos: Float32Array,
  [a, b, c]: readonly [number, number, number],
  out: Float32Array,
): void {
  const ux = pos[b]! - pos[a]!;
  const uy = pos[b + 1]! - pos[a + 1]!;
  const uz = pos[b + 2]! - pos[a + 2]!;
  const vx = pos[c]! - pos[a]!;
  const vy = pos[c + 1]! - pos[a + 1]!;
  const vz = pos[c + 2]! - pos[a + 2]!;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  for (const o of [a, b, c]) {
    out[o] = out[o]! + nx;
    out[o + 1] = out[o + 1]! + ny;
    out[o + 2] = out[o + 2]! + nz;
  }
}

function normalize(out: Float32Array): void {
  for (let o = 0; o < out.length; o += 3) {
    const l = Math.hypot(out[o]!, out[o + 1]!, out[o + 2]!) || 1;
    out[o] = out[o]! / l;
    out[o + 1] = out[o + 1]! / l;
    out[o + 2] = out[o + 2]! / l;
  }
}

export function faceNormals(pos: Float32Array, index: ArrayLike<number>, out: Float32Array): void {
  out.fill(0);
  for (let t = 0; t < index.length; t += 3) {
    accumulate(pos, [index[t]! * 3, index[t + 1]! * 3, index[t + 2]! * 3], out);
  }
  normalize(out);
}

export class NormalTracker {
  private readonly rest: Float32Array;
  private readonly restFaces: Float32Array;
  private readonly now: Float32Array;
  private readonly index: ArrayLike<number>;

  constructor(rest: Float32Array, restPos: Float32Array, index: ArrayLike<number>) {
    this.index = index;
    this.rest = rest.slice();
    this.restFaces = new Float32Array(rest.length);
    this.now = new Float32Array(rest.length);
    faceNormals(restPos, index, this.restFaces);
  }

  update(pos: Float32Array, out: Float32Array): void {
    faceNormals(pos, this.index, this.now);
    for (let o = 0; o < out.length; o++) out[o] = this.rest[o]! + this.now[o]! - this.restFaces[o]!;
    normalize(out);
  }
}
