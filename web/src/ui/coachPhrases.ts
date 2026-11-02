import type { CoachMove, Hint } from '../game/index.ts';
import { t } from './i18n.ts';

export const MIXED_SHARE = 0.1;
const SHOWN_SHARE = 0.005;

export function percent(value: number): string {
  return t('coach.percent', { value: Math.round(value * 100) });
}

export function moveText(move: CoachMove): string {
  return t(`coach.move.${move.label}`, { amount: move.amount });
}

export interface Share {
  move: CoachMove;
  share: number;
}

export function shares(hint: Hint): Share[] {
  return hint.moves
    .map((move, k) => ({ move, share: hint.mine[k] ?? 0 }))
    .filter(({ share }) => share >= SHOWN_SHARE)
    .sort((a, b) => b.share - a.share);
}

export function isMixed(hint: Hint): boolean {
  return hint.mine.filter((share) => share >= MIXED_SHARE).length >= 2;
}
