import type { Pad } from '../../game/index.ts';

export const pct = (v: number): string => `${Math.round(v * 100)}%`;

export const f2 = (v: number): string => v.toFixed(2);

export const bb = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)} bb`;

export const padText = (p: Pad): string => `P ${f2(p[0])}  A ${f2(p[1])}  D ${f2(p[2])}`;

export const clamp = (v: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, v));
