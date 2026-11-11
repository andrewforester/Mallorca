import { ATTACK_S, clamp, clamp01, massOf, saturate } from './emotions.ts';
import type { Traits } from './personality.ts';

export const STAKE_BB = 20;
export const EQUITY_LEANING = 0.5;
export const RELEASE_S = 1.5;

export interface Money {
  potBb: number;
  investedBb: number;
  stackBb?: number;
  streetsLeft?: number;
  toCallBb?: number;
}

export interface Prospect extends Money {
  equity: number;
  previousEquity?: number;
}

const logit = (p: number): number => Math.log(p / (1 - p));
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export function atStakeOf(p: Prospect): number {
  const future = Math.min(p.stackBb ?? 0, p.potBb * (p.streetsLeft ?? 0));
  return p.potBb / 2 + 0.5 * future * Math.abs(2 * p.equity - 1);
}

export function leaningOf(coping: number, equity: number): number {
  const c = clamp(coping, 0.01, 0.99);
  const e = clamp(equity, 0.01, 0.99);
  return sigmoid(logit(c) + EQUITY_LEANING * logit(e));
}

export function tensionTargets(p: Prospect, traits: Traits): { hope: number; fear: number } {
  const open = 4 * p.equity * (1 - p.equity);
  const tension = saturate(atStakeOf(p) / STAKE_BB) * open;
  const leaning = leaningOf(traits.coping, p.equity);
  return {
    hope: clamp01(tension * leaning * traits.gains.hope),
    fear: clamp01(tension * (1 - leaning) * traits.gains.fear),
  };
}

export function foldChanceOf(betBb: number, potBb: number): number {
  return potBb > 0 && betBb > 0 ? betBb / (potBb + betBb) : 0;
}

export function beliefOf(equity: number, foldChance: number): number {
  return clamp01(foldChance + (1 - foldChance) * equity);
}

export interface Held {
  value: number;
  pending: number;
}

export const NOTHING_HELD: Held = { value: 0, pending: 0 };

export const holdOf = (h: Held, amount: number): Held => ({
  value: h.value,
  pending: h.pending + massOf(amount),
});

export function stepHeld(h: Held, dt: number, halfLife: number): Held {
  const landed = h.pending * (1 - 0.5 ** (dt / ATTACK_S));
  const risen = 1 - (1 - h.value) * Math.exp(-landed);
  return { value: risen * 0.5 ** (dt / halfLife), pending: h.pending - landed };
}

export const withHeld = (value: number, h: Held): number => 1 - (1 - value) * (1 - h.value);
