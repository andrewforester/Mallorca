import { describe, expect, it } from 'vitest';
import { createEngine } from './engine.ts';
import { traitsOf } from './personality.ts';
import { MALLORCA, PERSONALITIES } from './profiles.ts';
import type { PersonalityKey } from './profiles.ts';
import { STYLE_SHARE, natureOf, styleOf } from './style.ts';

const NINE = ['mallorca', 'ingrid', 'mira', 'nina', 'lola', 'sol', 'rita', 'vera', 'greta'];

const EXTREMES: [string, string, number[]][] = [
  ['boldSchemer', '+-+--', [0.43, -0.29, 0.34, -0.35, -0.34, 0.05]],
  ['nervousCareerist', '+++-+', [0.49, 0.67, 0.54, -0.63, 0.63, 0.35]],
  ['lifeOfTheParty', '+-++-', [0.4, -0.45, 0.45, 0.71, -0.54, 0.05]],
  ['caringActivist', '+++++', [0.46, 0.5, 0.65, 0.43, 0.43, 0.35]],
  ['toughBoss', '-++--', [-0.35, 0.72, 0.3, -0.65, -0.5, 0.35]],
  ['hotheadBraggart', '--+-+', [-0.72, -0.38, 0.59, -0.59, 0.55, 0.05]],
  ['reliableCaptain', '-+++-', [-0.38, 0.59, 0.41, 0.4, -0.7, 0.35]],
  ['fussyChatterbox', '--+++', [-0.71, -0.55, 0.7, 0.47, 0.36, 0.05]],
  ['coldSceptic', '++---', [0.71, 0.55, -0.7, -0.47, -0.36, 0.83]],
  ['gloomyRebel', '+---+', [0.38, -0.59, -0.41, -0.4, 0.7, 0.35]],
  ['calmPhilosopher', '++-+-', [0.72, 0.38, -0.59, 0.59, -0.55, 0.83]],
  ['dreamyArtist', '+--++', [0.35, -0.72, -0.3, 0.65, 0.5, 0.35]],
  ['unshakableLoner', '-----', [-0.46, -0.5, -0.65, -0.43, -0.43, 0.35]],
  ['suspiciousGrump', '-+--+', [-0.4, 0.45, -0.45, -0.71, 0.54, 0.83]],
  ['easygoingHomebody', '---+-', [-0.49, -0.67, -0.54, 0.63, -0.63, 0.35]],
  ['timidStickler', '-+-++', [-0.43, 0.29, -0.34, 0.35, 0.34, 0.83]],
];

const MIDDLE: [string, number[]][] = [
  ['nervousPragmatist', [-0.52, -0.32, 0.24, -0.3, 0.52, 0.18]],
  ['curiousOptimist', [0.47, -0.07, 0.27, -0.22, -0.23, 0.24]],
  ['noisyBully', [0.36, -0.33, 0.45, -0.39, 0.1, 0.05]],
  ['plainRealist', [-0.25, -0.1, -0.07, 0.08, 0.04, 0.34]],
  ['quietTidy', [-0.22, 0.29, -0.48, 0.43, -0.2, 0.59]],
  ['softMiddle', [0.17, 0.21, -0.17, 0.16, -0.24, 0.46]],
  ['calmCurious', [0.58, 0.12, -0.03, 0.11, -0.45, 0.39]],
  ['reservedConservative', [-0.4, 0.25, -0.4, 0.32, 0.05, 0.54]],
];

function traitRow(key: string): number[] {
  const p = PERSONALITIES[key as PersonalityKey];
  const b = p.bigFive;
  return [
    b.openness,
    b.conscientiousness,
    b.extraversion,
    b.agreeableness,
    b.neuroticism,
    p.suppression,
  ];
}

describe('PERSONALITIES', () => {
  it('holds the nine characters, the sixteen extremes, the eight intermediate and neutral', () => {
    expect(Object.keys(PERSONALITIES)).toEqual([
      ...NINE,
      ...EXTREMES.map(([k]) => k),
      ...MIDDLE.map(([k]) => k),
      'neutral',
    ]);
    expect(PERSONALITIES.mallorca).toBe(MALLORCA);
  });

  it('gives the characters of the first design their traits', () => {
    const table: Record<string, number[]> = {
      mallorca: [0.4, 0.2, 0.4, 0.5, 0.1, 0.35],
      ingrid: [0.16, 0.62, -0.16, -0.37, -0.47, 0.85],
      mira: [0.36, 0.12, 0.2, 0.53, 0.06, 0.3],
      nina: [-0.23, 0.34, -0.32, 0.14, 0.41, 0.55],
      lola: [0.25, -0.48, 0.65, 0.18, 0.55, 0.08],
      sol: [0.36, -0.41, 0.53, 0.55, -0.16, 0.2],
      rita: [0.41, -0.3, 0.36, -0.35, -0.27, 0.2],
      vera: [-0.38, 0.61, 0.43, -0.56, 0.5, 0.5],
      greta: [-0.38, 0.35, -0.43, 0.14, 0.13, 0.6],
      neutral: [0, 0, 0, 0, 0, 0.3],
    };
    for (const [key, row] of Object.entries(table)) {
      expect(traitRow(key)).toEqual(row);
    }
  });

  it('gives the extremes the signs of the addendum and their traits and poker face', () => {
    for (const [key, signs, row] of EXTREMES) {
      expect(traitRow(key)).toEqual(row);
      expect(
        row
          .slice(0, 5)
          .map((v) => (v > 0 ? '+' : '-'))
          .join(''),
      ).toBe(signs);
    }
  });

  it('gives the intermediate characters their traits and poker face', () => {
    for (const [key, row] of MIDDLE) {
      expect(traitRow(key)).toEqual(row);
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

  it('keeps the rest style of every character within half of the style range', () => {
    const half = Math.atanh(0.5) / Math.atanh(STYLE_SHARE);
    for (const p of Object.values(PERSONALITIES)) {
      for (const v of Object.values(natureOf(p.bigFive))) {
        expect(Math.abs(v)).toBeLessThanOrEqual(half);
      }
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
    const engine = createEngine(MALLORCA, { changeTimeS: 20, returnTimeS: 1200 });
    engine.event({ kind: 'chat', signal: 'tease' });
    engine.event({ kind: 'deal', equity: 0.5, potBb: 3, investedBb: 1.5 });
    engine.event({
      kind: 'opponentBet',
      sizeBb: 10,
      equity: 0.5,
      raise: true,
    });
    engine.step(20);
    engine.event({ kind: 'result', netBb: -200, lastEquity: 0.3, decided: 'showdown' });
    const before = engine.snapshot();
    engine.setPersonality(PERSONALITIES.lola);
    const after = engine.snapshot();
    engine.event({
      kind: 'deal',
      equity: 0.3,
      potBb: 20,
      investedBb: 10,
      stackBb: 90,
      streetsLeft: 1,
    });
    engine.event({ kind: 'ownMove', move: 'bet', amountBb: 15, potBb: 20, equity: 0.3 });
    const believed = engine.snapshot();
    engine.setPersonality(PERSONALITIES.nina);
    engine.setPersonality(PERSONALITIES.lola);
    expect(engine.ahead(0).prospect).toEqual(believed.prospect);
    expect(engine.snapshot().belief).toBe(believed.belief);
    expect(believed.belief).toBeGreaterThan(0.3);
    const keep = ({
      emotions,
      mood,
      approach,
      certainty,
      pressure,
      prospect,
      sessionNetBb,
      time,
    }: typeof before) => ({
      emotions,
      mood,
      approach,
      certainty,
      pressure,
      prospect,
      sessionNetBb,
      time,
    });
    expect(before.approach).not.toBe(0);
    expect(before.certainty).not.toBe(0);
    expect(keep(after)).toEqual(keep(before));
    engine.step(2);
    expect(engine.snapshot().emotions.shame).toBeGreaterThan(before.emotions.shame + 0.3);
  });

  it('keeps the feeling and changes the traits, and reset starts at the new default mood', () => {
    const engine = createEngine(MALLORCA);
    engine.event({ kind: 'result', netBb: -40, lastEquity: 0.9, decided: 'showdown' });
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
