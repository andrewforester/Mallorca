import { describe, expect, it } from 'vitest';
import { MALLORCA, createEngine } from '../emotion/index.ts';
import type { Personality } from '../emotion/index.ts';
import type { Snapshot } from '../emotion/index.ts';
import { FEELING_VERSION, characterOf, feelingState } from './state.ts';

const plain = (s: Snapshot) => feelingState(s, null, s.traits.mask);

function badBeat(personality: Personality = MALLORCA) {
  const engine = createEngine(personality);
  const money = { potBb: 200, investedBb: 100, stackBb: 0, streetsLeft: 0 };
  engine.event({ kind: 'deal', equity: 0.82, ...money, streetsLeft: 3 });
  engine.event({ kind: 'street', equity: 0.05, ...money });
  engine.event({ kind: 'result', netBb: -100, lastEquity: 0.8 });
  engine.step(1);
  return engine.snapshot();
}

describe('the feeling sent to the table talk server', () => {
  it('names its version', () => {
    expect(plain(createEngine(MALLORCA).snapshot()).version).toBe(FEELING_VERSION);
  });

  it('is calm and empty before anything happens', () => {
    const state = plain(createEngine(MALLORCA).snapshot());
    expect(state.emotions).toEqual([]);
    expect(state.overload.level).toBeLessThan(0.1);
    expect(state.overload.source).toBeNull();
    expect(state.shows).toEqual({ mask: MALLORCA.suppression, acting: null });
  });

  it('keeps the three strongest emotions, strongest first, rounded', () => {
    const state = plain(badBeat());
    expect(state.emotions.length).toBeGreaterThan(0);
    expect(state.emotions.length).toBeLessThanOrEqual(3);
    const values = state.emotions.map((e) => e.intensity);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0.1);
      expect(Math.round(v * 100) / 100).toBe(v);
    }
    expect(state.emotions.map((e) => e.name)).toContain('injustice');
  });

  it('reports overload with its dominant source', () => {
    const state = plain(badBeat());
    expect(state.overload.level).toBeGreaterThan(0.1);
    expect(state.overload.source).not.toBeNull();
  });

  it('gives the mood octant of the snapshot', () => {
    const s = badBeat();
    expect(plain(s).mood).toEqual(s.octant);
  });

  it('sends the mask it is given, rounded, with the strength she acts', () => {
    const s = createEngine(MALLORCA).snapshot();
    expect(feelingState(s, 'strong', 0.7412).shows).toEqual({ mask: 0.74, acting: 'strong' });
  });
});

describe('her character sheet', () => {
  it('derives talkativeness, warmth, nerves and wit from the Big Five', () => {
    const sheet = characterOf(MALLORCA);
    expect(sheet.version).toBe(FEELING_VERSION);
    expect(sheet.talkativeness).toBeCloseTo(0.5 + 0.4 * 0.4, 2);
    expect(sheet.warmth).toBeCloseTo((1 + 0.5) / 2, 2);
    expect(sheet.nerves).toBeCloseTo((1 + 0.1) / 2, 2);
    expect(sheet.wit).toBeCloseTo((1 + 0.4) / 2, 2);
  });

  it('keeps every trait in [0, 1]', () => {
    const extreme: Personality = {
      bigFive: {
        openness: -1,
        conscientiousness: 1,
        extraversion: -1,
        agreeableness: -1,
        neuroticism: 1,
      },
      suppression: 1,
      experience: 0,
    };
    const sheet = characterOf(extreme);
    for (const key of ['talkativeness', 'warmth', 'nerves', 'wit'] as const) {
      expect(sheet[key]).toBeGreaterThanOrEqual(0);
      expect(sheet[key]).toBeLessThanOrEqual(1);
    }
  });
});
