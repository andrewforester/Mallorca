import { describe, expect, it } from 'vitest';
import { parseCards } from '../cards/index.ts';
import type { Card } from '../cards/index.ts';
import type { Action, LegalActions } from '../engine/index.ts';
import { createMathBrain } from './brain.ts';
import { decisionFixtures as decisions } from './decisionFixtures.ts';
import type { Observation } from './observation.ts';
import { parseObservation } from './observation.ts';
import { aggressive, call, check, fold } from './profit.ts';
import { toLegalAction } from './preprocess.ts';

function brainAfter(observations: readonly Observation[]) {
  const brain = createMathBrain();
  for (const o of observations) {
    brain.observe(o);
  }
  return brain;
}

function isLegal(action: Action, legal: LegalActions): boolean {
  switch (action.kind) {
    case 'fold':
      return legal.fold;
    case 'check':
      return legal.check;
    case 'call':
      return legal.call !== null;
    case 'raise':
      return (
        legal.raise !== null &&
        Number.isInteger(action.to) &&
        action.to >= legal.raise.min &&
        action.to <= legal.raise.max
      );
  }
}

const RAISE: LegalActions = { fold: true, check: false, call: 40, raise: { min: 120, max: 900 } };
const NO_RAISE: LegalActions = { fold: true, check: false, call: 40, raise: null };
const CHECK_ONLY: LegalActions = { fold: false, check: true, call: null, raise: null };

describe('toLegalAction', () => {
  it('raises to the opponent bet plus the raise amount', () => {
    expect(toLegalAction(aggressive(200, 40), RAISE, 80)).toEqual({ kind: 'raise', to: 280 });
  });

  it('clamps a raise below the minimum up to the minimum', () => {
    expect(toLegalAction(aggressive(10, 40), RAISE, 80)).toEqual({ kind: 'raise', to: 120 });
  });

  it('clamps a raise above the maximum down to all in', () => {
    expect(toLegalAction(aggressive(5000, 40), RAISE, 80)).toEqual({ kind: 'raise', to: 900 });
  });

  it('rounds a fractional raise to an integer', () => {
    expect(toLegalAction(aggressive(200.4, 40), RAISE, 80)).toEqual({ kind: 'raise', to: 280 });
    expect(toLegalAction(aggressive(200.5, 40), RAISE, 80)).toEqual({ kind: 'raise', to: 281 });
  });

  it('calls instead of raising when no raise is legal', () => {
    expect(toLegalAction(aggressive(200, 40), NO_RAISE, 80)).toEqual({ kind: 'call' });
  });

  it('checks instead of raising when there is nothing to call and no raise is legal', () => {
    expect(toLegalAction(aggressive(200, 0), CHECK_ONLY, 0)).toEqual({ kind: 'check' });
  });

  it('maps passive actions to call or check by what is legal', () => {
    expect(toLegalAction(call(40), RAISE, 80)).toEqual({ kind: 'call' });
    expect(toLegalAction(check(), CHECK_ONLY, 0)).toEqual({ kind: 'check' });
  });

  it('checks instead of folding when there is nothing to call', () => {
    expect(toLegalAction(fold(), RAISE, 80)).toEqual({ kind: 'fold' });
    expect(toLegalAction(fold(), CHECK_ONLY, 0)).toEqual({ kind: 'check' });
  });
});

describe('createMathBrain', () => {
  it.each(decisions.filter((_, index) => index % 10 === 0).map((f) => [f.id, f] as const))(
    'returns a legal action with an integer raise in %s under every legal set',
    (_id, fixture) => {
      const brain = brainAfter(fixture.observations.map(parseObservation));
      const variants: LegalActions[] = [fixture.legal, { ...fixture.legal, raise: null }];
      if (fixture.legal.raise !== null) {
        const { max } = fixture.legal.raise;
        variants.push({ ...fixture.legal, raise: { min: max, max } });
      }
      for (const legal of variants) {
        expect(isLegal(brain.decide(legal).action, legal)).toBe(true);
      }
    },
  );

  it('reports the class the solver picked before the action was clamped', () => {
    const fixture = decisions.find(({ chosen }) => chosen.kind === 'raise');
    expect(fixture).toBeDefined();
    const legal = fixture?.legal ?? CHECK_ONLY;
    const brain = brainAfter((fixture?.observations ?? []).map(parseObservation));
    const unclamped = brain.decide(legal);
    expect(unclamped.action.kind).toBe('raise');
    expect(unclamped.solverChoice).toBe('aggressive');
    const clamped = brain.decide({ ...legal, raise: null });
    expect(clamped.action.kind).not.toBe('raise');
    expect(clamped.solverChoice).toBe('aggressive');
  });

  it('never folds the nuts on the river', () => {
    const board = parseCards('Qs Js Ts 2c 3d');
    const observations: Observation[] = [
      {
        type: 'handStarted',
        handNumber: 1,
        heroOnButton: false,
        heroStack: 2000,
        villainStack: 2000,
        smallBlind: 10,
        bigBlind: 20,
      },
      { type: 'holeCards', cards: parseCards('As Ks') as [Card, Card] },
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
    const legal: LegalActions = {
      fold: true,
      check: false,
      call: 100,
      raise: { min: 200, max: 1980 },
    };
    const decision = brainAfter(observations).decide(legal);
    expect(decision.action.kind).not.toBe('fold');
    expect(decision.evByAction.passive).toBeGreaterThan(decision.evByAction.fold);
  });

  it('decides on the flop in under 1000 ms', () => {
    const flop = decisions.find((fixture) => fixture.java.street === 'flop');
    expect(flop).toBeDefined();
    const brain = brainAfter((flop?.observations ?? []).map(parseObservation));
    const start = process.hrtime.bigint();
    brain.decide(flop?.legal ?? CHECK_ONLY);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    expect(elapsedMs).toBeLessThan(1000);
  });
});
