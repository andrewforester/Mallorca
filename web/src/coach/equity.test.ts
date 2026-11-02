import { describe, expect, it } from 'vitest';
import { parseCards } from '../cards/index.ts';
import type { Card } from '../cards/index.ts';
import { Spectrum, SpectrumEquilator } from '../brains/index.ts';
import { equityVsRange } from './equity.ts';
import { PAIRS, cellName, cellOf, pairCards, pairIndex } from './grid.ts';

function only(cards: Card[]): Float32Array {
  const weights = new Float32Array(PAIRS);
  weights[pairIndex(cards[0] ?? 0, cards[1] ?? 0)] = 1;
  return weights;
}

describe('equityVsRange', () => {
  const [a, b] = parseCards('Ah Kh');
  const hero: [Card, Card] = [a ?? 0, b ?? 0];
  const board = parseCards('2c 7d Qh');

  it('against one hand equals the head-to-head equity', () => {
    const villain = parseCards('Qs Jd');
    const spectrum = Spectrum.empty();
    spectrum.add([villain[0] ?? 0, villain[1] ?? 0], 1);
    const expected = new SpectrumEquilator().strengthVsSpectrum(hero, board, spectrum);
    expect(equityVsRange(hero, board, only(villain))).toBeCloseTo(expected, 10);
  });

  it('against no range equals the equity against a random hand', () => {
    const expected = new SpectrumEquilator().strengthVsSpectrum(hero, board, Spectrum.random());
    expect(equityVsRange(hero, board, null)).toBeCloseTo(expected, 6);
  });

  it('works before the flop', () => {
    const aces = parseCards('As Ad');
    const kings = new Float32Array(PAIRS);
    for (let i = 0; i < PAIRS; i++) {
      const [x, y] = pairCards(i);
      if (cellName(cellOf(x, y)) === 'KK') kings[i] = 1;
    }
    expect(equityVsRange([aces[0] ?? 0, aces[1] ?? 0], [], kings)).toBeGreaterThan(0.8);
  });
});
