import table from './data/preflop-strength.json' with { type: 'json' };
import { rankPairIndex } from './javaCard.ts';
import type { HoleCards, Spectrum } from './spectrum.ts';

const STRENGTH: readonly (readonly number[])[] = table;

function strengthAt(hero: number, villain: number): number {
  return STRENGTH[hero]?.[villain] ?? Number.NaN;
}

export function preflopStrength(hero: HoleCards, villain: HoleCards): number {
  return strengthAt(rankPairIndex(hero[0], hero[1]), rankPairIndex(villain[0], villain[1]));
}

export function preflopStrengthVsSpectrum(hero: HoleCards, spectrum: Spectrum): number {
  let count = 0;
  let wins = 0;
  for (const { cards, weight } of spectrum.entries()) {
    wins += preflopStrength(hero, cards) * weight;
    count += weight;
  }
  return wins / count;
}
