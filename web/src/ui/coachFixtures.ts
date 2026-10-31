import type { CoachFacts, CoachState } from '../game/index.ts';

function strategyCells(): (number[] | null)[] {
  return Array.from({ length: 169 }, (_, cell) => (cell === 168 ? null : [0.2, 0.3, 0.5]));
}

export function coachFacts(overrides: Partial<CoachFacts> = {}): CoachFacts {
  return {
    hint: {
      moves: [
        { label: 'fold', amount: 0, tone: 'fold' },
        { label: 'call', amount: 10, tone: 'passive' },
        { label: 'raise', amount: 50, tone: 'small' },
      ],
      mine: [0, 0.3, 0.7],
      approximate: false,
      heroCell: 0,
    },
    strategy: strategyCells(),
    range: null,
    combos: null,
    equity: 0.852,
    versus: 'random',
    odds: { toCall: 10, requiredEquity: 0.25, mdf: 2 / 3, bluffShare: 0.25 },
    composition: null,
    outs: null,
    blockers: null,
    ...overrides,
  };
}

export function readyCoach(overrides: Partial<CoachFacts> = {}): CoachState {
  return { status: 'ready', facts: coachFacts(overrides) };
}
