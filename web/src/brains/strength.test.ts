import { describe, expect, it } from 'vitest';
import type { Card } from '../cards/index.ts';
import { parseCards } from '../cards/index.ts';
import { pheEvaluator } from '../equity/index.ts';
import javaTable from './fixtures/preflop-strength-java.json' with { type: 'json' };
import { HandState } from './handState.ts';
import type { Observation } from './observation.ts';
import {
  preflopEquityVsRandom,
  preflopStrength,
  preflopStrengthVsSpectrum,
} from './preflopEquilator.ts';
import { Spectrum } from './spectrum.ts';
import { StrengthManager } from './strength.ts';
import { randomVillainModel, VillainSpectrumTracker } from './villainModel.ts';

const hand = (text: string) => parseCards(text) as [Card, Card];

function strengthByEnumeration(hero: [Card, Card], range: Spectrum, board: Card[]): number {
  const heroRank = pheEvaluator.rank([...hero, ...board]);
  let total = 0;
  let won = 0;
  for (const { cards, weight } of range.entries()) {
    const villainRank = pheEvaluator.rank([...cards, ...board]);
    total += weight;
    if (heroRank > villainRank) {
      won += weight;
    } else if (heroRank === villainRank) {
      won += weight / 2;
    }
  }
  return won / total;
}

function expectEquity(
  actual: { strength: number; positivePotential: number; negativePotential: number } | undefined,
  strength: number,
  positivePotential: number,
  negativePotential: number,
): void {
  expect(actual?.strength).toBeCloseTo(strength, 12);
  expect(actual?.positivePotential).toBeCloseTo(positivePotential, 12);
  expect(actual?.negativePotential).toBeCloseTo(negativePotential, 12);
}

describe('randomVillainModel', () => {
  it('folds, calls or raises with a third each when facing a bet', () => {
    const state = new HandState(1);
    state.amountToCall = 40;
    expect(randomVillainModel.advise(state, hand('As Kd'))).toEqual({
      fold: 1 / 3,
      passive: 1 / 3,
      aggressive: 1 / 3,
    });
  });

  it('checks or bets with a half each when not facing a bet', () => {
    expect(randomVillainModel.advise(new HandState(2), hand('As Kd'))).toEqual({
      fold: 0,
      passive: 0.5,
      aggressive: 0.5,
    });
  });
});

describe('preflop equilator', () => {
  it('reads the strength of a rank pair against another from the table', () => {
    const table = javaTable as number[][];
    expect(preflopStrength(hand('Ac Kd'), hand('Qh Qs'))).toBe(table[167]?.[140]);
    expect(preflopStrength(hand('Kd As'), hand('2h 2s'))).toBe(table[167]?.[0]);
  });

  it('measures equity against a random hand as the Java PreflopEquilatorImpl', () => {
    expectEquity(
      preflopEquityVsRandom(hand('Ac Kd')),
      0.9338775510204081,
      0.42666666666666714,
      0.3319580419580415,
    );
    expectEquity(
      preflopEquityVsRandom(hand('7d 2c')),
      0.11755102040816326,
      0.32002775208140516,
      0.43583333333333346,
    );
    expectEquity(preflopEquityVsRandom(hand('As Ah')), 0.9991836734693877, 0.5, 0.1502614379084965);
  });

  it('weights the table strength by the spectrum', () => {
    expect(preflopStrengthVsSpectrum(hand('Ac Kd'), Spectrum.random())).toBeCloseTo(
      0.6549170437405741,
      12,
    );
  });
});

describe('StrengthManager', () => {
  const started: Observation = {
    type: 'handStarted',
    handNumber: 1,
    heroOnButton: false,
    heroStack: 2000,
    villainStack: 2000,
    smallBlind: 10,
    bigBlind: 20,
  };
  const flop = parseCards('Qs Jh 7d');
  const turn = parseCards('Qs Jh 7d 4c');
  const river = parseCards('Qs Jh 7d 4c 9h');

  function managerAt(board: Card[]): StrengthManager {
    const manager = new StrengthManager();
    manager.observe(started);
    manager.observe({ type: 'holeCards', cards: hand('Ah Kd') });
    if (board.length >= 3) manager.observe({ type: 'street', street: 'flop', board: flop });
    if (board.length >= 4) manager.observe({ type: 'street', street: 'turn', board: turn });
    if (board.length >= 5) manager.observe({ type: 'street', street: 'river', board: river });
    return manager;
  }

  it('takes preflop equity from the preflop equilator', () => {
    const preflop = managerAt([]).map('preflop');
    expect(preflop.get(hand('Ac Kd'))).toEqual(preflopEquityVsRandom(hand('Ac Kd')));
  });

  it('shares the flop potentials of the first combo of a rank pair, as the Java cache does', () => {
    const map = managerAt(flop).map('flop');
    const potentials = [0.19686903398243605, 0.10868028618222567] as const;
    expectEquity(map.get(hand('Ah Kh')), 0.5962072155411656, ...potentials);
    expectEquity(map.get(hand('Ac Kd')), 0.5962072155411656, ...potentials);
    expectEquity(map.get(hand('As Kc')), 0.5962072155411656, ...potentials);
    expectEquity(
      map.get(hand('2c 2d')),
      0.5999074930619797,
      0.04254335260115607,
      0.14556669236700076,
    );
    expectEquity(
      map.get(hand('Td 9d')),
      0.3593894542090657,
      0.23486562374649017,
      0.09952809952809953,
    );
    expectEquity(
      map.get(hand('Th 9c')),
      0.3593894542090657,
      0.23486562374649017,
      0.09952809952809953,
    );
    expect(map.get(hand('Qs 2c'))).toBeUndefined();
  });

  it('measures flop strength against every live hand', () => {
    const range = Spectrum.random();
    range.remove(...flop, ...hand('2c 2d'));
    const exact = strengthByEnumeration(hand('2c 2d'), range, flop);
    expect(managerAt(flop).map('flop').get(hand('2c 2d'))?.strength).toBeCloseTo(exact, 12);
  });

  it('computes turn and river strengths', () => {
    const turnMap = managerAt(turn).map('turn');
    expectEquity(
      turnMap.get(hand('Ah Kh')),
      0.49130434782608695,
      0.19515669515669515,
      0.1269330472870296,
    );
    expectEquity(
      turnMap.get(hand('5c 6c')),
      0.06618357487922705,
      0.2388891501669567,
      0.21101526211015262,
    );
    expectEquity(
      turnMap.get(hand('6d 5h')),
      0.06618357487922705,
      0.2388891501669567,
      0.21101526211015262,
    );
    const riverMap = managerAt(river).map('river');
    expectEquity(riverMap.get(hand('Ah Kh')), 0.36414141414141415, 0, 0);
    expectEquity(riverMap.get(hand('Th 8c')), 0.9833333333333333, 0, 0);
  });
});

describe('VillainSpectrumTracker', () => {
  const steps: Observation[] = [
    {
      type: 'handStarted',
      handNumber: 1,
      heroOnButton: false,
      heroStack: 2000,
      villainStack: 2000,
      smallBlind: 10,
      bigBlind: 20,
    },
    { type: 'holeCards', cards: hand('Ah Kd') },
    { type: 'acted', who: 'villain', action: { kind: 'raise', to: 60 }, amount: 50 },
    { type: 'acted', who: 'hero', action: { kind: 'call' }, amount: 40 },
    { type: 'street', street: 'flop', board: parseCards('Qs Jh 7d') },
    { type: 'acted', who: 'villain', action: { kind: 'raise', to: 40 }, amount: 40 },
    { type: 'acted', who: 'hero', action: { kind: 'raise', to: 120 }, amount: 120 },
    { type: 'acted', who: 'villain', action: { kind: 'call' }, amount: 80 },
    { type: 'street', street: 'turn', board: parseCards('Qs Jh 7d 4c') },
    { type: 'acted', who: 'villain', action: { kind: 'check' }, amount: 0 },
    { type: 'acted', who: 'villain', action: { kind: 'fold' }, amount: 0 },
    { type: 'street', street: 'river', board: parseCards('Qs Jh 7d 4c 9h') },
  ];

  function trackUpTo(count: number): VillainSpectrumTracker {
    const strength = new StrengthManager();
    const tracker = new VillainSpectrumTracker(randomVillainModel, strength);
    for (const o of steps.slice(0, count)) {
      strength.observe(o);
      tracker.observe(o);
    }
    return tracker;
  }

  function expectSpectrum(count: number, size: number, sum: number, weight: number): void {
    const spectrum = trackUpTo(count).spectrum;
    expect(spectrum.size).toBe(size);
    expect(spectrum.summaryWeight()).toBeCloseTo(sum, 9);
    expect(spectrum.weight(hand('As Ks'))).toBeCloseTo(weight, 15);
    expect(spectrum.weight(hand('Qh Qc'))).toBeCloseTo(weight, 15);
    expect(spectrum.weight(hand('Ah Qc'))).toBe(0);
  }

  it('starts from every hand the hero does not hold', () => {
    expectSpectrum(2, 1225, 1225, 1);
  });

  it('scales the spectrum by the model probability of each villain action', () => {
    expectSpectrum(3, 1225, 408.3333333333276, 1 / 3);
    expectSpectrum(5, 1081, 360.3333333333303, 1 / 3);
    expectSpectrum(6, 1081, 180.16666666666515, 1 / 6);
    expectSpectrum(8, 1081, 60.05555555555676, 1 / 18);
    expectSpectrum(10, 1035, 28.750000000000565, 1 / 36);
  });

  it('falls back to the random spectrum when the villain takes an action the model rules out', () => {
    expectSpectrum(11, 1035, 1035, 1);
    expectSpectrum(12, 990, 990, 1);
  });

  it('keeps the order of the Java spectrum', () => {
    const first = trackUpTo(8)
      .spectrum.entries()
      .slice(0, 3)
      .map(({ cards }) => cards);
    expect(first).toEqual([hand('6d 9c'), hand('6h 9c'), hand('7s 9c')]);
  });
});
