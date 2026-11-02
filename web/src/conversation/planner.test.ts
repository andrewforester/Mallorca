import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../cards/index.ts';
import type { Rng } from '../cards/index.ts';
import { applyAction } from '../engine/hand.ts';
import { call, check, deckOf, fold, raiseTo, startHand } from '../engine/testDeck.ts';
import type { Action, Step } from '../engine/types.ts';
import { createPersona } from '../persona/index.ts';
import type { Persona } from '../persona/index.ts';
import { createPlanner } from './planner.ts';
import type { Planned, Planner } from './planner.ts';
import { RULES } from './rules.ts';

const HER = 1;
const ALWAYS = RULES.map((r) => ({ ...r, chance: 1 }));

const rolls = (...values: number[]): Rng => {
  let k = 0;
  return { next: () => values[k++] ?? 0.99 };
};

interface Table {
  persona: Persona;
  planner: Planner;
  begin(her: string, player: string, board: string, nowMs?: number): Planned;
  act(action: Action, nowMs: number): Planned;
}

function table(rng: Rng = mulberry32(3)): Table {
  const persona = createPersona({ seat: HER, rng: mulberry32(5) });
  const planner = createPlanner({ seat: HER, rng, rules: ALWAYS });
  let step: Step | null = null;
  return {
    persona,
    planner,
    begin(her, player, board, nowMs = 0) {
      step = startHand([2000, 2000], deckOf(her, player, board), 0);
      return planner.observe(persona.observe(step.events, nowMs), persona, nowMs);
    },
    act(action, nowMs) {
      const current = step as Step;
      step = applyAction(current.hand, current.seats, action);
      return planner.observe(persona.observe(step.events, nowMs), persona, nowMs);
    },
  };
}

describe('the planner', () => {
  it('plans a line at her raise', () => {
    const t = table();
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    t.act(call, 1000);
    const planned = t.act(raiseTo(60), 3000);
    expect(planned.verdicts[0]?.speak).toBe(true);
    expect(['press', 'claim']).toContain(planned.plan?.act);
    expect(planned.plan?.handNumber).toBe(1);
  });

  it('speaks once a street', () => {
    const t = table();
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    t.act(call, 1000);
    expect(t.act(raiseTo(60), 3000).plan).not.toBeNull();
    const raised = t.act(raiseTo(180), 6000);
    expect(raised.plan).toBeNull();
    expect(raised.verdicts[0]?.reason).toBe('street');
  });

  it(`waits after her line`, () => {
    const t = table();
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    t.act(call, 1000);
    expect(t.act(raiseTo(60), 3000).plan).not.toBeNull();
    const soon = t.act(raiseTo(180), 3500);
    expect(soon.verdicts[0]?.reason).toBe('pace');
  });

  it('counts the hand in the session at its end', () => {
    const t = table();
    t.begin('Ah Ad', '7c 2d', '7h 7d 2s 3c 4c');
    t.act(raiseTo(2000), 1000);
    const end = t.act(call, 3000);
    expect(end.verdicts[0]?.occasion.kind).toBe('handEnded');
    const summary = t.planner.summary();
    expect(summary.hands).toBe(1);
    expect(summary.notable.map((n) => n.kind)).toEqual(['bigLoss']);
  });

  it('counts the bets of a fought hand', () => {
    const t = table();
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    t.act(raiseTo(60), 1000);
    t.act(raiseTo(180), 3000);
    t.act(raiseTo(540), 6000);
    t.act(fold, 9000);
    const fought = t.planner.summary().notable.filter((n) => n.kind === 'fought');
    expect(fought.map((n) => n.bets)).toEqual([3]);
  });

  it('plans the same lines for the same seed', () => {
    const run = () => {
      const t = table(mulberry32(11));
      const out = [t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd')];
      [call, check, check, check, check, check, raiseTo(40), call].forEach((a, k) =>
        out.push(t.act(a, 2000 * (k + 1))),
      );
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('cools the chance of a joke after one', () => {
    const t = table(rolls(0, 0.9, 0, 0.5, 0, 0.9, 0.99));
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    const first = t.planner.reply('ha', t.persona, 100);
    const second = t.planner.reply('ha', t.persona, 100);
    expect(first.plan?.humour).not.toBeNull();
    expect(second.humour?.p).toBeCloseTo((first.humour?.p ?? 0) * 0.3, 12);
  });

  it('answers between hands without a claim', () => {
    const t = table(rolls(0, 0.99, 0.99, 0, 0.1, 0.99));
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    t.act(raiseTo(60), 1000);
    t.act(fold, 3000);
    const reply = t.planner.reply('gg', t.persona, 6000);
    expect(reply.plan?.act).toBe('answer');
    expect(reply.plan?.claim).toBeNull();
    expect(reply.plan?.heard).toBe('gg');
  });
});
