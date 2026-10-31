import { describe, expect, it } from 'vitest';
import { renderable } from './canRender.ts';

describe('renderable', () => {
  it('needs WebGL', () => {
    expect(renderable({ webgl: false, cores: 8, memoryGb: 8 })).toBe(false);
    expect(renderable({ webgl: true })).toBe(true);
  });

  it('leaves out a weak device', () => {
    expect(renderable({ webgl: true, cores: 2, memoryGb: 8 })).toBe(false);
    expect(renderable({ webgl: true, cores: 8, memoryGb: 2 })).toBe(false);
    expect(renderable({ webgl: true, cores: 4, memoryGb: 4 })).toBe(true);
  });

  it('leaves out a software renderer', () => {
    const software = [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'Microsoft Basic Render Driver',
    ];
    for (const renderer of software) {
      expect(renderable({ webgl: true, renderer })).toBe(false);
    }
    expect(
      renderable({ webgl: true, renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro)' }),
    ).toBe(true);
  });
});
