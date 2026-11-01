import type { Pad } from '../emotion/index.ts';

export type Stance = 'bluff' | 'hide';

export interface Pose {
  effort: number;
  acted: Pad | null;
}

export const NO_POSE: Pose = { effort: 0, acted: null };

export const STANCES: Readonly<Record<Stance, Pose>> = {
  bluff: { effort: 0.6, acted: [0.2, 0, 0.6] },
  hide: { effort: 0.5, acted: null },
};

export const poseOf = (stance: Stance | null): Pose =>
  stance === null ? NO_POSE : STANCES[stance];
