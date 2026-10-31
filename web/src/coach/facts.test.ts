import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseCard } from '../cards/index.ts';
import type { Card } from '../cards/index.ts';
import type { Observation } from '../brains/index.ts';
import type { LegalActions } from '../engine/index.ts';
import {
  SHIPPED_STRATEGIES,
  WASM_URL,
  createCfrBrain,
  createCfrModel,
  inflate,
} from '../cfr/index.ts';
import type { CfrModel } from '../cfr/index.ts';
import { mulberry32 } from '../cards/index.ts';
import { coachFacts } from './facts.ts';
import { cellName } from './grid.ts';

let model: CfrModel;

beforeAll(async () => {
  model = await createCfrModel(
    readFileSync(WASM_URL),
    await inflate(readFileSync(SHIPPED_STRATEGIES.cfr.url)),
  );
});

const ACES: [Card, Card] = [parseCard('As'), parseCard('Ad')];
const OPEN: LegalActions = { fold: true, check: false, call: 10, raise: { min: 40, max: 2000 } };

function started(heroOnButton: boolean, cards: [Card, Card]): Observation[] {
  return [
    {
      type: 'handStarted',
      handNumber: 1,
      heroOnButton,
      heroStack: 2000,
      villainStack: 2000,
      smallBlind: 10,
      bigBlind: 20,
    },
    { type: 'holeCards', cards },
  ];
}

function cellIndex(name: string): number {
  for (let cell = 0; cell < 169; cell++) {
    if (cellName(cell) === name) return cell;
  }
  return -1;
}

describe('coachFacts', () => {
  it('gives the hint and the strategy grid of aces on the button', () => {
    const facts = coachFacts({
      model,
      observations: started(true, ACES),
      legal: OPEN,
      pot: 30,
      range: null,
    });
    const hint = facts.hint;
    expect(hint).not.toBeNull();
    const total = (hint?.mine ?? []).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
    const best = hint?.mine.indexOf(Math.max(...(hint.mine ?? []))) ?? -1;
    expect(['bet', 'raise', 'allIn']).toContain(hint?.moves[best]?.label);
    expect(hint?.heroCell).toBe(cellIndex('AA'));
    expect(facts.strategy).toHaveLength(169);
    expect(facts.strategy?.[cellIndex('AA')]).not.toBeNull();
    expect(facts.versus).toBe('random');
    expect(facts.range).toBeNull();
    expect(facts.odds?.toCall).toBe(10);
    expect(facts.equity).toBeGreaterThan(0.8);
  });

  it('labels the moves of the spot', () => {
    const facts = coachFacts({
      model,
      observations: started(true, ACES),
      legal: OPEN,
      pot: 30,
      range: null,
    });
    const labels = facts.hint?.moves.map((m) => m.label) ?? [];
    expect(labels).toContain('fold');
    expect(labels).toContain('call');
    const allIn = facts.hint?.moves.find((m) => m.label === 'allIn');
    expect(allIn?.amount).toBe(2000);
    expect(allIn?.tone).toBe('allIn');
  });

  it('weighs the bot range after it opened', () => {
    const brain = createCfrBrain(model, mulberry32(3));
    for (const o of started(true, [parseCard('Kc'), parseCard('Qc')])) brain.observe(o);
    const open = brain.decide(OPEN).action;
    expect(open.kind).toBe('raise');
    const to = open.kind === 'raise' ? open.to : 0;
    const observations: Observation[] = [
      ...started(false, ACES),
      { type: 'acted', who: 'villain', action: open, amount: to - 10 },
    ];
    const legal: LegalActions = {
      fold: true,
      check: false,
      call: to - 20,
      raise: { min: 2 * to - 20, max: 2000 },
    };
    const facts = coachFacts({ model, observations, legal, pot: to + 20, range: brain.range() });
    brain.dispose();
    expect(facts.versus).toBe('range');
    const aa = facts.range?.[cellIndex('KK')] ?? 0;
    const junk = facts.range?.[cellIndex('72o')] ?? 1;
    expect(aa).toBeGreaterThan(junk);
    expect(facts.combos).toBeGreaterThan(0);
    expect(facts.odds?.toCall).toBe(to - 20);
  });

  it('gives equal facts for the same request', () => {
    const request = { model, observations: started(true, ACES), legal: OPEN, pot: 30, range: null };
    expect(coachFacts(request)).toEqual(coachFacts(request));
  });
});
