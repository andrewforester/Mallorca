import { describe, expect, it } from 'vitest';
import { summarize } from './stats.ts';

describe('summarize', () => {
  it('balanced nets give zero bb per 100 and a known interval', () => {
    const s = summarize([40, -40, 40, -40], 20);
    expect(s.pairs).toBe(4);
    expect(s.hands).toBe(8);
    expect(s.bbPer100).toBe(0);
    expect(Math.abs(s.ci95 - (1.96 * 115.47) / 2)).toBeLessThan(0.01);
  });

  it('a single pair has an infinite interval', () => {
    const s = summarize([100], 20);
    expect(s.ci95).toBe(Infinity);
    expect(s.bbPer100).toBe(250);
  });

  it('counts the hands of a session pair', () => {
    const s = summarize([400, -400], 20, 400);
    expect(s.hands).toBe(800);
    expect(s.bbPer100).toBe(0);
    expect(summarize([400], 20, 400).bbPer100).toBe(5);
  });
});
