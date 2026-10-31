import type { Action } from '../engine/index.ts';
import type { CoachMove } from './moves.ts';
import type { CoachDecision } from './review.ts';
import type { SpotTag } from './spots.ts';

type Kind = 'aggressive' | 'fold';

export const LEAK_SPOTS: Readonly<Record<SpotTag, Kind>> = {
  open: 'aggressive',
  threeBet: 'aggressive',
  foldToThreeBet: 'fold',
  cbet: 'aggressive',
  foldToCbet: 'fold',
  turnBet: 'aggressive',
  riverBet: 'aggressive',
  riverFold: 'fold',
};

export const MIN_SPOTS = 10;

export interface Leak {
  spot: SpotTag;
  spots: number;
  player: number;
  strategy: number;
}

function actionIs(action: Action, kind: Kind): boolean {
  return kind === 'fold' ? action.kind === 'fold' : action.kind === 'raise';
}

function moveIs(move: CoachMove, kind: Kind): boolean {
  return kind === 'fold' ? move.label === 'fold' : move.tone !== 'fold' && move.tone !== 'passive';
}

function strategyShare(decision: CoachDecision, kind: Kind): number {
  return decision.moves.reduce(
    (sum, move, k) => sum + (moveIs(move, kind) ? (decision.mine[k] ?? 0) : 0),
    0,
  );
}

export function leaks(decisions: readonly CoachDecision[]): Leak[] {
  const tags = Object.keys(LEAK_SPOTS) as SpotTag[];
  return tags.flatMap((spot) => {
    const kind = LEAK_SPOTS[spot];
    const mine = decisions.filter((decision) => decision.spot === spot);
    if (mine.length === 0) return [];
    const player = mine.filter((decision) => actionIs(decision.action, kind)).length;
    const strategy = mine.reduce((sum, decision) => sum + strategyShare(decision, kind), 0);
    return [
      { spot, spots: mine.length, player: player / mine.length, strategy: strategy / mine.length },
    ];
  });
}
