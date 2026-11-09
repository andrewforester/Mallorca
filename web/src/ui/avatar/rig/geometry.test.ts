import { describe, expect, it } from 'vitest';
import type { MeshSection } from './assets.ts';
import { meshGeometry } from './geometry.ts';

function section(): { bin: ArrayBuffer; mesh: MeshSection } {
  const bytes = new ArrayBuffer(256);
  new Int16Array(bytes, 0, 6).set([-32767, 0, 0, 32767, 0, 0]);
  new Uint16Array(bytes, 16, 3).set([0, 1, 1]);
  const skin = new Uint16Array(bytes, 32, 24);
  skin.set([3, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0], 0);
  skin.set([4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 12);
  new Int8Array(bytes, 96, 24).fill(-127);
  new Int8Array(bytes, 96, 24)[0] = 127;
  const q = (offset: number, length: number, k: number) => ({
    offset,
    length,
    type: (offset === 96 ? 'int8' : 'int16') as 'int8' | 'int16',
    scale: new Array(k).fill(offset === 96 ? 0.5 / 127 : 1 / 32767),
    offset3: new Array(k).fill(offset === 96 ? 0.5 : 0),
  });
  const mesh: MeshSection = {
    name: 'test',
    position: q(0, 6, 3),
    normal: q(0, 6, 3),
    uv: q(0, 4, 2),
    index: { offset: 16, length: 3, type: 'uint16' },
    skinIndex: { offset: 32, length: 24, type: 'uint16' },
    skinWeight: q(96, 24, 12),
    targets: [],
  };
  return { bin: bytes, mesh };
}

describe('meshGeometry', () => {
  it('decodes positions and keeps a writable copy for the CPU blendshapes', () => {
    const { bin, mesh } = section();
    const { geometry, base } = meshGeometry(bin, mesh);
    expect([...base]).toEqual([-1, 0, 0, 1, 0, 0]);
    expect(geometry.getAttribute('position').array).not.toBe(base);
    expect(geometry.index?.count).toBe(3);
  });

  it('spreads twelve skin influences over three vec4 attributes', () => {
    const { bin, mesh } = section();
    const { geometry } = meshGeometry(bin, mesh);
    expect(geometry.getAttribute('skinIndex').getX(0)).toBe(3);
    expect(geometry.getAttribute('skinIndex2').getX(0)).toBe(9);
    expect(geometry.getAttribute('skinIndex').getX(1)).toBe(4);
    expect(geometry.getAttribute('skinWeight').getX(0)).toBeCloseTo(1);
    expect(geometry.getAttribute('skinWeight1').getX(0)).toBeCloseTo(0);
  });

  it('renormalizes quantized skin weights so every vertex sums to one', () => {
    const { bin, mesh } = section();
    new Int8Array(bin, 96, 24).set([
      100,
      90,
      ...new Array(10).fill(-127),
      127,
      ...new Array(11).fill(-127),
    ]);
    const { geometry } = meshGeometry(bin, mesh);
    const sum = (v: number) =>
      ['skinWeight', 'skinWeight1', 'skinWeight2'].reduce((acc, name) => {
        const a = geometry.getAttribute(name);
        return acc + a.getX(v) + a.getY(v) + a.getZ(v) + a.getW(v);
      }, 0);
    expect(sum(0)).toBeCloseTo(1, 6);
    expect(sum(1)).toBeCloseTo(1, 6);
  });
});
