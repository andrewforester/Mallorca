import { applyAction } from './hand.ts';
import { legalActions } from './legal.ts';
import type { Action, LegalActions, SeatIndex, Step } from './types.ts';

export type Actor = (seat: SeatIndex, legal: LegalActions) => Action;

export function playToEnd(start: Step, act: Actor, onStep: (step: Step) => void): Step {
  let step = start;
  onStep(step);
  while (step.hand.toAct !== null) {
    const seat = step.hand.toAct;
    step = applyAction(step.hand, step.seats, act(seat, legalActions(step.hand, step.seats)));
    onStep(step);
  }
  return step;
}
