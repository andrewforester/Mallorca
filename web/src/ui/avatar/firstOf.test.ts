import { describe, expect, it, vi } from 'vitest';
import { firstOf } from './firstOf.ts';

describe('firstOf', () => {
  it('takes the first attempt that succeeds, with its place, and does not try the rest', async () => {
    const third = vi.fn(() => Promise.resolve('portrait'));
    const result = await firstOf([
      () => Promise.reject(new Error('rig')),
      () => Promise.resolve('glb'),
      third,
    ]);
    expect(result).toEqual({ value: 'glb', index: 1 });
    expect(third).not.toHaveBeenCalled();
  });

  it('starts from a later place when the earlier ones are spent', async () => {
    const first = vi.fn(() => Promise.resolve('rig'));
    const result = await firstOf([first, () => Promise.resolve('glb')], 1);
    expect(result).toEqual({ value: 'glb', index: 1 });
    expect(first).not.toHaveBeenCalled();
  });

  it('rejects with the last error when every attempt fails', async () => {
    await expect(
      firstOf([() => Promise.reject(new Error('rig')), () => Promise.reject(new Error('glb'))]),
    ).rejects.toThrow('glb');
  });

  it('rejects when there is nothing left to try', async () => {
    await expect(firstOf([() => Promise.resolve(1)], 1)).rejects.toThrow();
  });
});
