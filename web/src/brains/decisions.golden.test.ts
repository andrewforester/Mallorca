import { describe, expect, it } from 'vitest';
import { createMathBrain } from './brain.ts';
import type { DecisionFixture } from './decisionFixtures.ts';
import { decisionFixtures as decisions } from './decisionFixtures.ts';
import { parseObservation } from './observation.ts';

const CLASSES = ['fold', 'passive', 'aggressive'] as const;

function expected(value: number | null): number {
  return value ?? Number.NEGATIVE_INFINITY;
}

function decide(fixture: DecisionFixture) {
  const brain = createMathBrain();
  for (const raw of fixture.observations) {
    brain.observe(parseObservation(raw));
  }
  return brain.decide(fixture.legal);
}

describe('math brain against the Java bot', () => {
  it.each(decisions.map((fixture) => [fixture.id, fixture] as const))(
    'reproduces decision %s',
    (_id, fixture) => {
      const decision = decide(fixture);
      const tolerance = 0.005 * fixture.java.pot + 0.5;
      for (const kind of CLASSES) {
        const want = expected(fixture.evByAction[kind]);
        const got = decision.evByAction[kind];
        if (want === Number.NEGATIVE_INFINITY) {
          expect(got).toBe(Number.NEGATIVE_INFINITY);
        } else {
          expect(Math.abs(got - want)).toBeLessThanOrEqual(tolerance);
        }
      }
      expect(decision.action).toEqual(fixture.chosen);
    },
  );
});
