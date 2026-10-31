import { describe, expect, it } from 'vitest';
import { parseCard, parseCards } from '../cards/index.ts';
import type { Card } from '../cards/index.ts';
import { classify, composition } from './composition.ts';
import { PAIRS, pairIndex } from './grid.ts';

function hole(text: string): [Card, Card] {
  const [a, b] = text.split(' ');
  return [parseCard(a ?? ''), parseCard(b ?? '')];
}

describe('classify', () => {
  const cases: [string, string, string][] = [
    ['7c 7d', '7h Ks 2d', 'strong'],
    ['Kd 2c', 'Ks 2d 9h', 'twoPair'],
    ['Ah Kc', 'Ks 8d 3c', 'topPair'],
    ['Qc Qd', 'Js 8d 3c', 'topPair'],
    ['8c 9d', 'Ks 8d 3c', 'pair'],
    ['Ah 5h', 'Kh 8h 3c', 'draw'],
    ['9c Td', 'Js 8d 2c', 'draw'],
    ['Ac Qd', '8s 8d 3c', 'air'],
    ['4c 5d', 'Ks Kd Kh', 'air'],
    ['4c 5d', '6s 7d 8h', 'strong'],
    ['Ah 5h', 'Kh 8h 3c 2s 9d', 'air'],
  ];
  for (const [hand, board, expected] of cases) {
    it(`${hand} on ${board} is ${expected}`, () => {
      expect(classify(hole(hand), parseCards(board))).toBe(expected);
    });
  }
});

describe('composition', () => {
  const board = parseCards('Ks 8d 3c');

  it('splits a uniform range into shares that sum to one', () => {
    const result = composition(new Float32Array(PAIRS).fill(1), hole('Ah Ad'), board);
    const total = Object.values(result?.shares ?? {}).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(result?.shares.strong).toBeGreaterThan(0);
    expect(result?.ahead).toBeGreaterThan(0.5);
    expect(result?.ahead).toBeLessThan(1);
  });

  it('is ahead of the whole range when it holds the nuts', () => {
    const weights = new Float32Array(PAIRS);
    const [q, j] = hole('Qh Jh');
    weights[pairIndex(q, j)] = 1;
    expect(composition(weights, hole('Kc Kd'), board)?.ahead).toBe(1);
  });

  it('is null before the flop and on an empty range', () => {
    expect(composition(new Float32Array(PAIRS).fill(1), hole('Ah Ad'), [])).toBeNull();
    expect(composition(new Float32Array(PAIRS), hole('Ah Ad'), board)).toBeNull();
  });
});
