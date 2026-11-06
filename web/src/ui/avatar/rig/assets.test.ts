import { describe, expect, it } from 'vitest';
import { decode, loadAssets } from './assets.ts';

describe('decode', () => {
  it('scales and offsets each component of a quantized int16 section', () => {
    const bin = new Int16Array([-32767, 0, 32767, 32767, 0, -32767]).buffer;
    const section = {
      offset: 0,
      length: 6,
      type: 'int16' as const,
      scale: [1 / 32767, 2 / 32767, 1],
      offset3: [0, 1, 0],
    };
    const out = decode(bin, section);
    expect(out).toBeInstanceOf(Float32Array);
    [-1, 1, 32767, 1, 1, -32767].forEach((v, i) => expect(out[i]).toBeCloseTo(v, 4));
  });

  it('decodes an int8 section with one component', () => {
    const bin = new Int8Array([0, 0, 127, -127]).buffer;
    const out = decode(bin, {
      offset: 2,
      length: 2,
      type: 'int8',
      scale: [0.5 / 127],
      offset3: [0.5],
    });
    expect(out[0]).toBeCloseTo(1);
    expect(out[1]).toBeCloseTo(0);
  });

  it('returns an index section as its own integer type at its byte offset', () => {
    const bin = new Uint16Array([9, 9, 1, 2, 3]).buffer;
    const out = decode(bin, { offset: 4, length: 3, type: 'uint16' });
    expect(out).toBeInstanceOf(Uint16Array);
    expect([...out]).toEqual([1, 2, 3]);
  });
});

describe('loadAssets', () => {
  it('rejects when one file cannot be fetched', async () => {
    const fetcher = (url: string) =>
      Promise.resolve(
        new Response(url.endsWith('rig.bin') ? null : '{}', {
          status: url.endsWith('rig.bin') ? 404 : 200,
        }),
      );
    await expect(loadAssets('/her/', fetcher)).rejects.toThrow('rig.bin');
  });

  it('reads the header, the binary, the DNA, the masks and the mapping', async () => {
    const files: Record<string, BodyInit> = {
      'rig.json': '{"controls":["jawOpen"]}',
      'rig.bin': new Uint8Array([1, 2]),
      'behavior.dna': new Uint8Array([3]),
      'masks.r8': new Uint8Array([4, 5, 6]),
      'mapping.json': '{"jawOpen":{"jawOpen":1}}',
    };
    const fetcher = (url: string) =>
      Promise.resolve(new Response(files[url.replace('/her/', '')]!));
    const assets = await loadAssets('/her/', fetcher);
    expect(assets.header.controls).toEqual(['jawOpen']);
    expect(assets.bin.byteLength).toBe(2);
    expect([...assets.dna]).toEqual([3]);
    expect(assets.masks.length).toBe(3);
    expect(assets.mapping.jawOpen).toEqual({ jawOpen: 1 });
  });
});
