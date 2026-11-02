import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../cards/index.ts';
import { PERSONALITIES } from '../persona/index.ts';
import { applyAction } from '../engine/hand.ts';
import { call, deckOf, raiseTo, startHand } from '../engine/testDeck.ts';
import type { Step } from '../engine/types.ts';
import { sessionPersona } from './sessionPersona.ts';
import type { PersonaHost } from './sessionPersona.ts';

function host(clock: { ms: number }, ranges: number[] = []): PersonaHost {
  return {
    botSeat: 1,
    now: () => clock.ms,
    epoch: () => 1,
    handNumber: () => 1,
    playerRange: () => {
      ranges.push(clock.ms);
      return Promise.resolve(null);
    },
  };
}

function badBeat(observe: (step: Step) => void, clock: { ms: number }): void {
  let step = startHand([2000, 2000], deckOf('As Ah', 'Js Ts', 'Kc 9d 2s 3h Qh'), 0);
  observe(step);
  for (const action of [raiseTo(60), raiseTo(2000), call]) {
    clock.ms += 1000;
    step = applyAction(step.hand, step.seats, action);
    observe(step);
  }
}

describe('her persona in the session', () => {
  it('gives the bias of her view at that moment against a Solver', () => {
    const clock = { ms: 0 };
    const her = sessionPersona(host(clock));
    her.begin('cfr', mulberry32(1));
    badBeat((step) => her.observe(step.events), clock);
    clock.ms += 4000;
    expect(her.bias()).toEqual(her.current()?.view(clock.ms).bias);
    expect(her.bias()?.tightness).toBeLessThan(1);
  });

  it('gives no bias against the math bot', () => {
    const clock = { ms: 0 };
    const her = sessionPersona(host(clock));
    her.begin('math', mulberry32(1));
    badBeat((step) => her.observe(step.events), clock);
    expect(her.bias()).toBeUndefined();
    expect(her.current()).not.toBeNull();
  });

  it('gives the next persona the personality chosen for her', () => {
    const her = sessionPersona(host({ ms: 0 }));
    her.setPersonality(PERSONALITIES.lola);
    her.begin('cfr', mulberry32(1));
    expect(her.current()?.view(0).personality).toBe(PERSONALITIES.lola);
  });

  it("asks the player's range only after his action against a Solver", async () => {
    const clock = { ms: 0 };
    const ranges: number[] = [];
    const solver = sessionPersona(host(clock, ranges));
    solver.begin('cfr', mulberry32(1));
    let step = startHand([2000, 2000], deckOf('As Ah', 'Js Ts', 'Kc 9d 2s 3h Qh'), 0);
    solver.observe(step.events);
    step = applyAction(step.hand, step.seats, raiseTo(60));
    solver.observe(step.events);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(ranges).toHaveLength(1);
    const math = sessionPersona(host(clock, ranges));
    math.begin('math', mulberry32(1));
    math.observe(step.events);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(ranges).toHaveLength(1);
  });
});
