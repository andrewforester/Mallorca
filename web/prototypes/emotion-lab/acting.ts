import { PRESENTING_EFFORT } from '../../src/persona/index.ts';
import type { StrengthClass } from '../../src/persona/index.ts';

export function actingEffort(acting: StrengthClass | null): number {
  if (acting === null) return 0;
  return acting === 'weak' ? PRESENTING_EFFORT.hide : PRESENTING_EFFORT.bluff;
}
