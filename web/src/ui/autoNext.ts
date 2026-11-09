import type { ViewModel } from '../game/index.ts';

const AFTER_FOLD_MS = 1000;
const AFTER_SHOWDOWN_MS = 2000;

export function nextHandDelay(vm: ViewModel): number | null {
  if (vm.result === null || vm.tournamentWinner !== null) {
    return null;
  }
  const wonWithoutShowdown = vm.result.winner !== null && vm.result.category === null;
  return wonWithoutShowdown ? AFTER_FOLD_MS : AFTER_SHOWDOWN_MS;
}
