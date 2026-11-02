import type { Card } from '../cards/index.ts';
import { Spectrum, SpectrumEquilator, preflopStrengthVsSpectrum } from '../brains/index.ts';
import { PAIRS, isLive, pairCards } from './grid.ts';

function spectrumOf(weights: ArrayLike<number> | null, dead: readonly Card[]): Spectrum {
  const spectrum = Spectrum.empty();
  for (let i = 0; i < PAIRS; i++) {
    const weight = weights === null ? 1 : (weights[i] ?? 0);
    if (weight > 0 && isLive(i, dead)) {
      spectrum.add(pairCards(i), weight);
    }
  }
  return spectrum;
}

export function equityVsRange(
  hero: [Card, Card],
  board: readonly Card[],
  weights: ArrayLike<number> | null,
): number {
  const spectrum = spectrumOf(weights, [...hero, ...board]);
  if (spectrum.isEmpty()) {
    return Number.NaN;
  }
  if (board.length === 0) {
    return preflopStrengthVsSpectrum(hero, spectrum);
  }
  return new SpectrumEquilator().strengthVsSpectrum(hero, board, spectrum);
}
