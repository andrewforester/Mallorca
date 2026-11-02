import { describe, expect, it } from 'vitest';
import type { Card } from '../cards/index.ts';
import { parseCards } from '../cards/index.ts';
import { HandState } from './handState.ts';
import type { Observation } from './observation.ts';
import { randomAdvice, VillainSpectrumTracker } from './villainModel.ts';

const hand = (text: string) => parseCards(text) as [Card, Card];

describe('randomAdvice', () => {
  it('folds, calls or raises with a third each when facing a bet', () => {
    const state = new HandState(1);
    state.amountToCall = 40;
    expect(randomAdvice(state)).toEqual({
      fold: 1 / 3,
      passive: 1 / 3,
      aggressive: 1 / 3,
    });
  });

  it('checks or bets with a half each when not facing a bet', () => {
    expect(randomAdvice(new HandState(2))).toEqual({
      fold: 0,
      passive: 0.5,
      aggressive: 0.5,
    });
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
    const tracker = new VillainSpectrumTracker();
    for (const o of steps.slice(0, count)) {
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
