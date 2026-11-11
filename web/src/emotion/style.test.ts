import { describe, expect, it } from 'vitest';
import { BIAS_KEYS } from './biasKeys.ts';
import type { BiasKey } from './biasKeys.ts';
import type { BigFive } from './personality.ts';
import { PERSONALITIES } from './profiles.ts';
import { STYLE_SHARE, STYLE_WEIGHTS, natureOf, styleFrom, styleOf } from './style.ts';

const NEUTRAL: BigFive = {
  openness: 0,
  conscientiousness: 0,
  extraversion: 0,
  agreeableness: 0,
  neuroticism: 0,
};

const TRAITS = Object.keys(NEUTRAL) as (keyof BigFive)[];

const allAxes = (v: number): Record<BiasKey, number> =>
  Object.fromEntries(BIAS_KEYS.map((k) => [k, v])) as Record<BiasKey, number>;

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const row = (o: number, c: number, e: number, a: number, n: number): BigFive => ({
  openness: o,
  conscientiousness: c,
  extraversion: e,
  agreeableness: a,
  neuroticism: n,
});

describe('STYLE_WEIGHTS', () => {
  it('gives each axis one leading trait, as in the addendum', () => {
    expect(STYLE_SHARE).toBe(0.7);
    expect(STYLE_WEIGHTS).toEqual({
      aggression: row(0.05, 0, 1, -0.15, -0.25),
      looseness: row(1, -0.2, 0.15, 0, 0.1),
      bluff: row(0.15, -0.2, 0, -1, -0.1),
      stickiness: row(0.15, -0.1, 0, -0.2, -1),
      sizing: row(0.05, -1, 0.2, -0.2, -0.15),
    });
  });
});

describe('natureOf', () => {
  it('is the weighted traits over 0.8 times the largest weight', () => {
    const b = row(0.3, -0.2, 0.5, 0.1, -0.4);
    const w = STYLE_WEIGHTS.bluff;
    const sum = TRAITS.reduce((s, t) => s + w[t] * b[t], 0);
    expect(natureOf(b).bluff).toBeCloseTo(sum / 0.8, 12);
    expect(Object.values(natureOf(NEUTRAL))).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('styleOf', () => {
  it('gives the nine characters their rest styles', () => {
    const table: Record<string, number[]> = {
      mallorca: [1.26, 1.35, 0.71, 0.85, 0.89],
      ingrid: [1.02, 0.97, 1.26, 0.71, 1.41],
      mira: [1.1, 1.3, 0.71, 0.88, 0.91],
      nina: [0.73, 0.8, 0.81, 0.71, 0.71],
      lola: [1.41, 1.41, 0.93, 1.41, 0.71],
      sol: [1.41, 1.41, 0.75, 1.37, 1.11],
      rita: [1.41, 1.41, 1.41, 1.41, 1.35],
      vera: [1.3, 0.76, 1.27, 0.71, 0.71],
      greta: [0.71, 0.71, 0.82, 0.71, 0.83],
    };
    for (const [key, values] of Object.entries(table)) {
      const style = styleOf(PERSONALITIES[key as keyof typeof PERSONALITIES].bigFive);
      BIAS_KEYS.forEach((axis, i) =>
        expect(Math.abs(style[axis] - (values[i] ?? 0))).toBeLessThan(0.006),
      );
    }
  });

  it('sends the 32 extreme profiles to all 16 corners, two each, split by sizing', () => {
    const corners = new Map<string, number[]>();
    for (let mask = 0; mask < 32; mask++) {
      const sign = (bit: number): number => ((mask >> bit) & 1 ? 0.8 : -0.8);
      const style = styleOf(row(sign(0), sign(1), sign(2), sign(3), sign(4)));
      const key = (['aggression', 'looseness', 'bluff', 'stickiness'] as const)
        .map((axis) => (style[axis] > 1 ? '+' : '-'))
        .join('');
      corners.set(key, [...(corners.get(key) ?? []), style.sizing]);
    }
    expect(corners.size).toBe(16);
    for (const sizes of corners.values()) {
      expect(sizes).toHaveLength(2);
      expect(Math.sign((sizes[0] ?? 1) - 1)).toBe(-Math.sign((sizes[1] ?? 1) - 1));
    }
  });

  it('is the blueprint for an average character and stays inside the range for anyone', () => {
    expect(Object.values(styleOf(NEUTRAL))).toEqual([1, 1, 1, 1, 1]);
    const next = lcg(7);
    for (let i = 0; i < 200; i++) {
      const b = Object.fromEntries(TRAITS.map((t) => [t, 2 * next() - 1])) as unknown as BigFive;
      for (const v of Object.values(styleOf(b))) {
        expect(v).toBeGreaterThan(0.5);
        expect(v).toBeLessThan(2);
      }
    }
  });
});

describe('styleFrom', () => {
  it('adds the push to the nature inside the tanh and approaches the edges', () => {
    const style = styleFrom(allAxes(0.25), allAxes(0.3));
    expect(style.bluff).toBeCloseTo(2 ** Math.tanh(Math.atanh(0.7) * 0.25 + 0.3), 12);
    expect(styleFrom(allAxes(1.5), allAxes(5)).aggression).toBeLessThan(2);
    expect(styleFrom(allAxes(-1.5), allAxes(-5)).aggression).toBeGreaterThan(0.5);
  });
});
