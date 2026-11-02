import { describe, expect, it } from 'vitest';
import { createEngine } from './engine.ts';
import { traitsOf } from './personality.ts';
import { MALLORCA, PERSONALITIES } from './profiles.ts';
import { styleOf } from './style.ts';

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

  it('gives every profile self-control equal to its experience', () => {
    for (const p of Object.values(PERSONALITIES)) {
      expect(p.control).toBe(p.experience);
    }
  });

  it('keeps the discipline and composure every profile had before self-control', () => {
    for (const p of Object.values(PERSONALITIES)) {
      const b = p.bigFive;
      const t = traitsOf(p);
      const composure =
        0.45 + 0.15 * b.conscientiousness - 0.25 * b.neuroticism + 0.35 * p.experience;
      const discipline =
        0.25 + 0.2 * b.conscientiousness - 0.15 * b.neuroticism + 0.5 * p.experience;
      expect(t.composure).toBeCloseTo(Math.min(1.2, Math.max(0.1, composure)), 9);
      expect(t.discipline).toBeCloseTo(Math.min(0.95, Math.max(0, discipline)), 9);
    }
  });

  it('takes discipline from self-control, not from experience', () => {
    const p = PERSONALITIES.mira;
    expect(traitsOf({ ...p, experience: 1 }).discipline).toBe(traitsOf(p).discipline);
    expect(traitsOf({ ...p, control: 1 }).discipline).toBeGreaterThan(traitsOf(p).discipline);
  });

  it('takes composure from both self-control and experience', () => {
    const p = PERSONALITIES.mira;
    expect(traitsOf({ ...p, experience: 1 }).composure).toBeGreaterThan(traitsOf(p).composure);
    expect(traitsOf({ ...p, control: 1 }).composure).toBeGreaterThan(traitsOf(p).composure);
  });

  it('plays the natural style of the character at rest', () => {
    for (const p of Object.values(PERSONALITIES)) {
      expect(traitsOf(p).baseline).toEqual(styleOf(p.bigFive, p.experience));
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
