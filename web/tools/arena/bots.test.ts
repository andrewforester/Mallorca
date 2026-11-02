import { describe, expect, it } from 'vitest';
import type { Brain, Observation } from '../../src/brains/index.ts';
import { fromBrain } from './bots.ts';

const legal = { fold: true, check: false, call: 10, raise: { min: 40, max: 2000 } };
const observation: Observation = { type: 'holeCards', cards: [48, 44] };

function brain(dispose?: () => void): Brain & { seen: Observation[] } {
  const seen: Observation[] = [];
  return {
    seen,
    observe: (o) => seen.push(o),
    decide: () => ({
      action: { kind: 'call' },
      solverChoice: 'passive',
      evByAction: { fold: 0, passive: 1, aggressive: 2 },
    }),
    ...(dispose === undefined ? {} : { dispose }),
  };
}

describe('fromBrain', () => {
  it('forwards observations and plays the action of the decision', () => {
    const inner = brain();
    const bot = fromBrain(inner);
    bot.observe(observation);
    expect(inner.seen).toEqual([observation]);
    expect(bot.decide(legal)).toEqual({ kind: 'call' });
    expect(() => bot.dispose?.()).not.toThrow();
  });

  it('disposes a brain that can be disposed', () => {
    let disposed = 0;
    fromBrain(brain(() => (disposed += 1))).dispose?.();
    expect(disposed).toBe(1);
  });
});
