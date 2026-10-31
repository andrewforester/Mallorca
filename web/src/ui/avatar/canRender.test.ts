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
});
