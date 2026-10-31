import { describe, expect, it } from 'vitest';
import { iterationCount } from './model.ts';

describe('iterationCount', () => {
  it('keeps a non-negative integer', () => {
    expect(iterationCount(0)).toBe(0);
    expect(iterationCount(200)).toBe(200);
  });

  it('floors a fraction', () => {
    expect(iterationCount(12.9)).toBe(12);
    expect(iterationCount(0.5)).toBe(0);
  });

  it('turns a negative count into zero', () => {
    expect(iterationCount(-1)).toBe(0);
    expect(iterationCount(-0.5)).toBe(0);
  });

  it('turns a non-finite count into zero', () => {
    expect(iterationCount(Number.NaN)).toBe(0);
    expect(iterationCount(Number.POSITIVE_INFINITY)).toBe(0);
    expect(iterationCount(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});
