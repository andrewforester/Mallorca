import { describe, expect, it } from 'vitest';
import { traitsOf } from './personality.ts';
import type { Traits } from './personality.ts';
import { MALLORCA, PERSONALITIES } from './profiles.ts';
import {
  beliefOf,
  foldChanceOf,
  EQUITY_LEANING,
  RELEASE_S,
  STAKE_BB,
  atStakeOf,
  leaningOf,
  tensionTargets,
} from './tension.ts';
import type { Prospect } from './tension.ts';

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const logit = (p: number): number => Math.log(p / (1 - p));

const spot = (potBb: number, equity: number, streetsLeft: number): Prospect => ({
  equity,
  potBb,
  investedBb: potBb / 2,
  stackBb: 100,
  streetsLeft,
});

const coping = (value: number): Traits => ({ ...traitsOf(MALLORCA), coping: value });

describe('tension constants', () => {
  it('follows the spec', () => {
    expect(STAKE_BB).toBe(20);
    expect(EQUITY_LEANING).toBe(0.5);
    expect(RELEASE_S).toBe(1.5);
  });
});

describe('atStakeOf', () => {
  it('counts half the pot and the money expected to go in later', () => {
    expect(atStakeOf(spot(2, 0.5, 2))).toBeCloseTo(1, 12);
    expect(atStakeOf(spot(6, 0.86, 2))).toBeCloseTo(3 + 0.5 * 12 * 0.72, 12);
    for (const equity of [0, 0.3, 0.5, 0.95]) {
      expect(atStakeOf(spot(70, equity, 0))).toBeCloseTo(35, 12);
    }
  });

  it('caps the future money at the stack', () => {
    expect(atStakeOf(spot(80, 1, 3))).toBeCloseTo(40 + 0.5 * 100, 12);
  });
});

describe('leaningOf', () => {
  it('tilts her coping by half the equity', () => {
    expect(leaningOf(0.5, 0.5)).toBeCloseTo(0.5, 12);
    expect(leaningOf(0.26, 0.86)).toBeCloseTo(sigmoid(logit(0.26) + 0.5 * logit(0.86)), 12);
  });

  it('stays finite inside zero and one at a made nut and a dead hand', () => {
    for (const equity of [0, 1]) {
      const v = leaningOf(0.5, equity);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('tensionTargets', () => {
  it('feels nothing when the outcome is settled', () => {
    for (const equity of [0, 1]) {
      expect(tensionTargets(spot(120, equity, 0), traitsOf(MALLORCA))).toEqual({
        hope: 0,
        fear: 0,
      });
    }
  });

  it('feels a big open pot as fear without coping and as hope with it', () => {
    const t = traitsOf(MALLORCA);
    const tension = 1 - Math.exp(-60 / 20);
    const low = tensionTargets(spot(120, 0.5, 1), coping(0.18));
    expect(low.fear).toBeGreaterThan(0.8);
    expect(low.fear).toBeCloseTo(tension * 0.82 * t.gains.fear, 12);
    expect(low.hope).toBeCloseTo(tension * 0.18 * t.gains.hope, 12);
    expect(low.hope).toBeLessThan(low.fear / 4);
    const high = tensionTargets(spot(120, 0.5, 1), coping(0.75));
    expect(high.hope).toBeGreaterThan(high.fear);
  });

  it('barely feels a limped coin flip, whoever she is', () => {
    for (const p of Object.values(PERSONALITIES)) {
      const target = tensionTargets(spot(2, 0.5, 2), traitsOf(p));
      expect(target.hope).toBeLessThan(0.06);
      expect(target.fear).toBeLessThan(0.06);
    }
  });
});

describe('belief in winning the pot', () => {
  it('adds the chance that he folds to her bet, the break-even of a bluff', () => {
    expect(foldChanceOf(15, 20)).toBeCloseTo(15 / 35, 12);
    expect(foldChanceOf(0, 0)).toBe(0);
    expect(foldChanceOf(0, 20)).toBe(0);
    expect(foldChanceOf(15, 0)).toBe(0);
    expect(beliefOf(0.1, 15 / 35)).toBeCloseTo(0.4857, 4);
    expect(beliefOf(0, 0.5)).toBe(0.5);
    expect(beliefOf(1, 0.5)).toBe(1);
    expect(beliefOf(0.3, 0)).toBe(0.3);
  });
});
