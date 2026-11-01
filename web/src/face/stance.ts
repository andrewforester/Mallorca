import type { Pad } from '../emotion/index.ts';

export type Stance = 'bluff' | 'hide';

export interface Shown {
  stance: Stance;
  effort: number;
}

export const STANCES: Readonly<Record<Stance, Pad | null>> = {
  bluff: [0.2, 0, 0.6],
  hide: null,
};
