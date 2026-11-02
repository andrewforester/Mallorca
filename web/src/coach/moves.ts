import type { Action, LegalActions } from '../engine/index.ts';

export type MoveLabel = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allIn';
export type MoveTone = 'fold' | 'passive' | 'small' | 'large' | 'allIn';

export interface CoachMove {
  label: MoveLabel;
  amount: number;
  tone: MoveTone;
}

const LARGE = 0.75;

export function coachMove(action: Action, legal: LegalActions, pot: number): CoachMove {
  switch (action.kind) {
    case 'fold':
      return { label: 'fold', amount: 0, tone: 'fold' };
    case 'check':
      return { label: 'check', amount: 0, tone: 'passive' };
    case 'call':
      return { label: 'call', amount: legal.call ?? 0, tone: 'passive' };
    case 'raise': {
      if (legal.raise !== null && action.to >= legal.raise.max) {
        return { label: 'allIn', amount: action.to, tone: 'allIn' };
      }
      const label = legal.call === null ? 'bet' : 'raise';
      const large = action.to > LARGE * (pot + (legal.call ?? 0));
      return { label, amount: action.to, tone: large ? 'large' : 'small' };
    }
  }
}
