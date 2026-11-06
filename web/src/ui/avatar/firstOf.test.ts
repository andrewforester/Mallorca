import { describe, expect, it, vi } from 'vitest';
import { firstOf } from './firstOf.ts';

describe('firstOf', () => {
  it('takes the first attempt that succeeds and does not try the rest', async () => {
    const third = vi.fn(() => Promise.resolve('portrait'));
    const result = await firstOf([
      () => Promise.reject(new Error('rig')),
      () => Promise.resolve('glb'),
      third,
    ]);
    expect(result).toBe('glb');
    expect(third).not.toHaveBeenCalled();
  });

  it('rejects with the last error when every attempt fails', async () => {
    await expect(
      firstOf([() => Promise.reject(new Error('rig')), () => Promise.reject(new Error('glb'))]),
    ).rejects.toThrow('glb');
  });

  it('rejects when there is nothing to try', async () => {
    await expect(firstOf([])).rejects.toThrow();
  });
});
