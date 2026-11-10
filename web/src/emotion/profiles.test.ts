import { describe, expect, it } from 'vitest';
import { createEngine } from './engine.ts';
import { traitsOf } from './personality.ts';
import { MALLORCA, PERSONALITIES } from './profiles.ts';
import { styleOf } from './style.ts';

describe('PERSONALITIES', () => {
  it('holds the nine characters and the neutral reference', () => {
    expect(Object.keys(PERSONALITIES)).toEqual([
      'mallorca',
      'ingrid',
      'mira',
      'nina',
      'lola',
      'sol',
      'rita',
      'vera',
      'greta',
      'neutral',
    ]);
    expect(PERSONALITIES.mallorca).toBe(MALLORCA);
  });

  it('gives every character the traits of the spec', () => {
    const table: Record<string, number[]> = {
      mallorca: [0.4, 0.2, 0.4, 0.5, 0.1, 0.35],
      ingrid: [0.2, 0.8, -0.2, -0.4, -0.8, 0.85],
      mira: [0.3, 0.2, 0.2, 0.9, 0.1, 0.3],
      nina: [-0.3, 0.8, -0.4, 0.3, 0.8, 0.55],
      lola: [0.5, -0.6, 0.7, 0.2, 0.8, 0.08],
      sol: [0.8, -0.5, 0.9, 0.5, -0.2, 0.2],
      rita: [0.8, -0.7, 0.9, -0.6, -0.4, 0.2],
      vera: [-0.4, 0.8, 0.4, -0.5, 0.6, 0.5],
      greta: [-0.6, 0.5, -0.8, 0.2, 0.2, 0.6],
      neutral: [0, 0, 0, 0, 0, 0.3],
    };
    for (const [key, p] of Object.entries(PERSONALITIES)) {
      const b = p.bigFive;
      expect([
        b.openness,
        b.conscientiousness,
        b.extraversion,
        b.agreeableness,
        b.neuroticism,
        p.suppression,
      ]).toEqual(table[key]);
    }
  });

  it('keeps every trait in its range', () => {
    for (const p of Object.values(PERSONALITIES)) {
      for (const v of Object.values(p.bigFive)) {
        expect(Math.abs(v)).toBeLessThanOrEqual(1);
      }
      expect(p.suppression).toBeGreaterThanOrEqual(0);
      expect(p.suppression).toBeLessThanOrEqual(1);
      expect(Object.keys(p).sort()).toEqual(['bigFive', 'suppression']);
    }
  });

  it('plays the natural style of the character at rest', () => {
    for (const p of Object.values(PERSONALITIES)) {
      expect(traitsOf(p).baseline).toEqual(styleOf(p.bigFive));
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
  it('keeps emotions, mood, approach, pressure and the impulses still rising', () => {
    const engine = createEngine(MALLORCA);
    engine.event({ kind: 'chat', signal: 'tease' });
    engine.event({
      kind: 'opponentBet',
      sizeBb: 10,
      equity: 0.5,
      raise: true,
    });
    engine.step(120);
    engine.event({ kind: 'bluff', succeeded: false, potBb: 40 });
    const before = engine.snapshot();
    engine.setPersonality(PERSONALITIES.lola);
    const after = engine.snapshot();
    const keep = ({
      emotions,
      mood,
      approach,
      pressure,
      prospect,
      sessionNetBb,
      time,
    }: typeof before) => ({
      emotions,
      mood,
      approach,
      pressure,
      prospect,
      sessionNetBb,
      time,
    });
    expect(before.approach).not.toBe(0);
    expect(keep(after)).toEqual(keep(before));
    engine.step(2);
    expect(engine.snapshot().emotions.shame).toBeGreaterThan(before.emotions.shame + 0.3);
  });

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
