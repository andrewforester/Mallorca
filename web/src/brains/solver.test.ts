import { describe, expect, it } from 'vitest';
import type { Card } from '../cards/index.ts';
import { parseCards } from '../cards/index.ts';
import { GameContext, HandStateObserver } from './handState.ts';
import type { Observation } from './observation.ts';
import { createRaiseAction, RandomVariable } from './profit.ts';
import { NLGameSolver } from './solver.ts';
import { VillainSpectrumTracker } from './villainModel.ts';

const board = parseCards('Qs Js Ts 2c 3d');
const hero = parseCards('As Ks') as [Card, Card];

const riverFacingBet: Observation[] = [
  {
    type: 'handStarted',
    handNumber: 1,
    heroOnButton: false,
    heroStack: 2000,
    villainStack: 2000,
    smallBlind: 10,
    bigBlind: 20,
  },
  { type: 'holeCards', cards: hero },
  { type: 'acted', who: 'villain', action: { kind: 'call' }, amount: 10 },
  { type: 'acted', who: 'hero', action: { kind: 'check' }, amount: 0 },
  { type: 'street', street: 'flop', board: board.slice(0, 3) },
  { type: 'acted', who: 'hero', action: { kind: 'check' }, amount: 0 },
  { type: 'acted', who: 'villain', action: { kind: 'check' }, amount: 0 },
  { type: 'street', street: 'turn', board: board.slice(0, 4) },
  { type: 'acted', who: 'hero', action: { kind: 'check' }, amount: 0 },
  { type: 'acted', who: 'villain', action: { kind: 'check' }, amount: 0 },
  { type: 'street', street: 'river', board },
  { type: 'acted', who: 'hero', action: { kind: 'check' }, amount: 0 },
  { type: 'acted', who: 'villain', action: { kind: 'raise', to: 100 }, amount: 100 },
];

function callProfit(solver: NLGameSolver): number {
  const game = new GameContext();
  const state = new HandStateObserver(true);
  const tracker = new VillainSpectrumTracker();
  for (const o of riverFacingBet) {
    game.observe(o);
    state.observe(o);
    tracker.observe(o);
  }
  const distribution = solver.onSecondAction(
    {
      game,
      info: state.situation(),
      effectiveStack: game.bankRollAtRisk,
      pot: game.pot,
      spectrum: tracker.spectrum,
      hero,
      isHeroOnButton: false,
    },
    100,
  );
  return distribution.find(({ action }) => action.type === 'passive')?.profit.getEV() ?? 0;
}

describe('NLGameSolver', () => {
  it('counts only the chips the villain put in on this street when calling with the nuts', () => {
    expect(callProfit(new NLGameSolver())).toBeCloseTo(100, 9);
  });
});

describe('createRaiseAction', () => {
  it('raises the pot after the call', () => {
    expect(createRaiseAction(40, 100, 2000, 1).amount).toBe(140);
  });

  it('goes all in when the stack left would be small against the pot', () => {
    expect(createRaiseAction(40, 100, 300, 1).amount).toBe(300);
  });
});

describe('RandomVariable', () => {
  it('has the mean and the standard deviation of its outcomes', () => {
    const variable = new RandomVariable();
    variable.add(0.5, 10);
    variable.add(0.5, -10);
    expect(variable.getEV()).toBe(0);
    expect(variable.getVariance()).toBe(10);
  });

  it('scales the probabilities of a nested variable', () => {
    const nested = new RandomVariable();
    nested.add(0.5, 4);
    nested.add(0.5, 0);
    const variable = RandomVariable.constant(1);
    const outer = new RandomVariable();
    outer.addVariable(0.5, variable);
    outer.addVariable(0.5, nested);
    expect(outer.size).toBe(3);
    expect(outer.getEV()).toBe(1.5);
  });
});
