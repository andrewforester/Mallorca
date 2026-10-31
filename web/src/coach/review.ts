import type { Action, BettingStreet } from '../engine/index.ts';
import type { Hint } from './facts.ts';
import type { CoachMove } from './moves.ts';
import type { SpotTag } from './spots.ts';

export type Grade = 'strategy' | 'rare' | 'off';

export interface CoachDecision {
  street: BettingStreet;
  action: Action;
  moves: CoachMove[];
  mine: number[];
  approximate: boolean;
  chosen: number | null;
  frequency: number | null;
  grade: Grade | null;
  spot: SpotTag | null;
}

const STRATEGY = 0.25;
const RARE = 0.05;

export function grade(frequency: number): Grade {
  if (frequency >= STRATEGY) return 'strategy';
  return frequency >= RARE ? 'rare' : 'off';
}

function nearestRaise(to: number, moves: CoachMove[]): number | null {
  let best: number | null = null;
  moves.forEach((move, index) => {
    if (move.label !== 'bet' && move.label !== 'raise' && move.label !== 'allIn') return;
    const current = best === null ? Infinity : Math.abs((moves[best]?.amount ?? 0) - to);
    if (Math.abs(move.amount - to) < current) best = index;
  });
  return best;
}

export function chosenMove(action: Action, moves: CoachMove[]): number | null {
  if (action.kind === 'raise') return nearestRaise(action.to, moves);
  const index = moves.findIndex((move) => move.label === action.kind);
  return index < 0 ? null : index;
}

export function reviewDecision(
  hint: Hint,
  action: Action,
  street: BettingStreet,
  spot: SpotTag | null,
): CoachDecision {
  const chosen = chosenMove(action, hint.moves);
  const frequency = chosen === null ? null : (hint.mine[chosen] ?? 0);
  return {
    street,
    action,
    moves: hint.moves,
    mine: hint.mine,
    approximate: hint.approximate,
    chosen,
    frequency,
    grade: frequency === null ? null : grade(frequency),
    spot,
  };
}
