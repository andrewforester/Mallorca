import { describe, expect, it } from 'vitest';
import type { Card } from '../cards/index.ts';
import { parseCards } from '../cards/index.ts';
import javaTable from './fixtures/preflop-strength-java.json' with { type: 'json' };
import { preflopStrength, preflopStrengthVsSpectrum } from './preflopEquilator.ts';
import { Spectrum } from './spectrum.ts';

const hand = (text: string) => parseCards(text) as [Card, Card];

describe('preflop equilator', () => {
  it('reads the strength of a rank pair against another from the table', () => {
    const table = javaTable as number[][];
    expect(preflopStrength(hand('Ac Kd'), hand('Qh Qs'))).toBe(table[167]?.[140]);
    expect(preflopStrength(hand('Kd As'), hand('2h 2s'))).toBe(table[167]?.[0]);
  });

  it('weights the table strength by the spectrum', () => {
    expect(preflopStrengthVsSpectrum(hand('Ac Kd'), Spectrum.random())).toBeCloseTo(
      0.6549170437405741,
      12,
    );
  });
});
