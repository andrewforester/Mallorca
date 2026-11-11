import { describe, expect, it } from 'vitest';
import { createEngine } from './engine.ts';
import { traitsOf } from './personality.ts';
import { MALLORCA, PERSONALITIES } from './profiles.ts';
import type { PersonalityKey } from './profiles.ts';
import { styleOf } from './style.ts';

const NINE = ['mallorca', 'ingrid', 'mira', 'nina', 'lola', 'sol', 'rita', 'vera', 'greta'];

const EXTREMES: [string, string][] = [
  ['boldSchemer', '+-+--'],
  ['nervousCareerist', '+++-+'],
  ['lifeOfTheParty', '+-++-'],
  ['caringActivist', '+++++'],
  ['toughBoss', '-++--'],
  ['hotheadBraggart', '--+-+'],
  ['reliableCaptain', '-+++-'],
  ['fussyChatterbox', '--+++'],
  ['coldSceptic', '++---'],
  ['gloomyRebel', '+---+'],
  ['calmPhilosopher', '++-+-'],
  ['dreamyArtist', '+--++'],
  ['unshakableLoner', '-----'],
  ['suspiciousGrump', '-+--+'],
  ['easygoingHomebody', '---+-'],
  ['timidStickler', '-+-++'],
];

const MIDDLE: [string, number[]][] = [
  ['nervousPragmatist', [-0.52, -0.32, 0.24, -0.3, 0.52]],
  ['curiousOptimist', [0.57, -0.08, 0.28, -0.22, -0.23]],
  ['noisyBully', [0.47, -0.43, 0.6, -0.52, 0.06]],
  ['plainRealist', [-0.25, -0.1, -0.07, 0.08, 0.04]],
  ['quietTidy', [-0.22, 0.29, -0.5, 0.44, -0.2]],
  ['softMiddle', [0.17, 0.21, -0.17, 0.16, -0.24]],
  ['calmCurious', [0.7, 0.1, -0.02, 0.1, -0.53]],
  ['reservedConservative', [-0.42, 0.25, -0.4, 0.32, 0.05]],
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
    for (const [key, row] of Object.entries(table)) {
      expect(traitRow(key)).toEqual(row);
    }
  });

  it('gives the extremes every trait at 0.8 with the signs of the addendum', () => {
    for (const [key, signs] of EXTREMES) {
      expect(traitRow(key).slice(0, 5)).toEqual([...signs].map((c) => (c === '+' ? 0.8 : -0.8)));
    }
  });

  it('gives the intermediate characters the traits of the addendum', () => {
    for (const [key, traits] of MIDDLE) {
      expect(traitRow(key).slice(0, 5)).toEqual(traits);
    }
  });

  it('gives the new characters a poker face habit from conscientiousness and extraversion', () => {
    for (const key of [...EXTREMES.map(([k]) => k), ...MIDDLE.map(([k]) => k)]) {
      const b = PERSONALITIES[key as PersonalityKey].bigFive;
      const habit = Math.min(
        0.9,
        Math.max(0.05, 0.35 + 0.3 * b.conscientiousness - 0.3 * b.extraversion),
      );
      expect(PERSONALITIES[key as PersonalityKey].suppression).toBe(Math.round(habit * 100) / 100);
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
    const engine = createEngine(MALLORCA, {
      changeTimeS: 20,
      returnTimeS: 1200,
      changeHands: Infinity,
      returnHands: Infinity,
    });
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
