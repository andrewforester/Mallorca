import type { ShippedStrategyKey } from '../cfr/index.ts';

export type Opponent = 'math' | ShippedStrategyKey;

export const OPPONENTS: readonly Opponent[] = ['math', 'cfr', 'cfr-v2'];

const LARGE: readonly Opponent[] = ['cfr-v2'];

export function opponentsFor(finePointer: boolean): readonly Opponent[] {
  return finePointer ? OPPONENTS : OPPONENTS.filter((o) => !LARGE.includes(o));
}
