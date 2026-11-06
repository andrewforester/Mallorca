import { describe, expect, it, vi } from 'vitest';
import type { FaceRenderer } from './avatar.ts';
import { mountFace } from './live.ts';

function renderer(
  load: (canvas: HTMLCanvasElement) => Promise<void>,
): FaceRenderer & { dispose: () => void } {
  const canvas = document.createElement('canvas');
  return { canvas, load: () => load(canvas), resize: vi.fn(), render: vi.fn(), dispose: vi.fn() };
}

const options = (create: () => FaceRenderer) => ({
  create,
  frame: () => null,
  calm: true,
  onLost: vi.fn(),
});

describe('mountFace', () => {
  it('rejects and disposes the renderer when its context is lost while it loads', async () => {
    const face = renderer(async (canvas) => {
      canvas.dispatchEvent(new Event('webglcontextlost'));
    });
    const host = document.createElement('div');
    await expect(
      mountFace(
        host,
        options(() => face),
      ),
    ).rejects.toThrow('context lost');
    expect(face.dispose).toHaveBeenCalled();
    expect(host.contains(face.canvas)).toBe(false);
  });

  it('rejects and disposes the renderer when it fails to load', async () => {
    const face = renderer(() => Promise.reject(new Error('rig.bin: 404')));
    await expect(
      mountFace(
        document.createElement('div'),
        options(() => face),
      ),
    ).rejects.toThrow('rig.bin');
    expect(face.dispose).toHaveBeenCalled();
  });
});
