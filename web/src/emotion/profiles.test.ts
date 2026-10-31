import { describe, expect, it } from 'vitest';
import { createEngine } from './engine.ts';
import { MALLORCA, PERSONALITIES } from './profiles.ts';

describe('PERSONALITIES', () => {
  it('holds Mallorca and the four sandbox presets', () => {
    expect(Object.keys(PERSONALITIES)).toEqual(['mallorca', 'mira', 'ingrid', 'lola', 'nina']);
    expect(PERSONALITIES.mallorca).toBe(MALLORCA);
  });

  it('keeps every trait in its range', () => {
    for (const p of Object.values(PERSONALITIES)) {
      for (const v of Object.values(p.bigFive)) {
        expect(Math.abs(v)).toBeLessThanOrEqual(1);
      }
      expect(p.suppression).toBeGreaterThanOrEqual(0);
      expect(p.suppression).toBeLessThanOrEqual(1);
      expect(p.experience).toBeGreaterThanOrEqual(0);
      expect(p.experience).toBeLessThanOrEqual(1);
    }
  });

  it('gives Lola less composure and discipline than Ingrid', () => {
    const lola = createEngine(PERSONALITIES.lola).snapshot().traits;
    const ingrid = createEngine(PERSONALITIES.ingrid).snapshot().traits;
    expect(lola.composure).toBeLessThan(ingrid.composure);
    expect(lola.discipline).toBeLessThan(ingrid.discipline);
  });
});

describe('setPersonality', () => {
  it('keeps the feeling and changes the traits, and reset starts at the new default mood', () => {
    const engine = createEngine(MALLORCA);
    engine.event({ kind: 'result', netBb: -40, lastEquity: 0.9 });
    const before = engine.snapshot();
    engine.setPersonality(PERSONALITIES.lola);
    const after = engine.snapshot();
    expect(after.emotions).toEqual(before.emotions);
    expect(after.sessionNetBb).toBe(before.sessionNetBb);
    expect(after.traits).not.toEqual(before.traits);
    engine.reset();
    expect(engine.snapshot().mood).toEqual(after.traits.defaultMood);
  });
});
