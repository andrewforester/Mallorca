import { describe, expect, it } from 'vitest';
import { parseCard, parseCards } from '../cards/index.ts';
import type { Card } from '../cards/index.ts';
import { blockers } from './blockers.ts';
import { PAIRS, pairIndex } from './grid.ts';
import { outs } from './outs.ts';

function hole(text: string): [Card, Card] {
  const [a, b] = text.split(' ');
  return [parseCard(a ?? ''), parseCard(b ?? '')];
}

describe('outs', () => {
  it('counts the flush cards of a flush draw', () => {
    const result = outs(hole('Ah 5h'), parseCards('Kh 8h 3c'), null);
    for (const card of parseCards('2h 3h 4h 6h 7h 9h Th Jh Qh')) {
      expect(result?.cards).toContain(card);
    }
    const n = result?.cards.length ?? 0;
    expect(result?.nextCard).toBeCloseTo(n / 47, 10);
    expect(result?.byRiver).toBeCloseTo(1 - (1 - n / 47) * (1 - n / 46), 10);
  });

  it('lists the cards that fill up a set', () => {
    const result = outs(hole('7c 7d'), parseCards('7h Ks 2d'), null);
    for (const card of parseCards('Kc Kd Kh 2c 2h 2s 7s')) {
      expect(result?.cards).toContain(card);
    }
  });

  it('does not count a card that only pairs the board', () => {
    const result = outs(hole('Ks 8d'), parseCards('As Th 3h'), null);
    for (const card of parseCards('3c 3d 3s Ac Ad Ah Tc Td Ts')) {
      expect(result?.cards).not.toContain(card);
    }
    expect(result?.cards).toContain(parseCard('Kc'));
  });

  it('does not count a board pair that only adds a second pair', () => {
    const result = outs(hole('Ac Kd'), parseCards('Ks 8h 3c'), null);
    for (const card of parseCards('3d 3h 3s 8c 8d 8s')) {
      expect(result?.cards).not.toContain(card);
    }
    expect(result?.cards).toContain(parseCard('Ah'));
  });

  it('counts the card that makes a better straight than the board', () => {
    const result = outs(hole('Tc 2d'), parseCards('5h 6s 7c 8d'), null);
    expect(result?.cards).toContain(parseCard('9h'));
  });

  it('has no chance by the river on the turn and no outs on the river or preflop', () => {
    expect(outs(hole('Ah 5h'), parseCards('Kh 8h 3c 2s'), null)?.byRiver).toBeNull();
    expect(outs(hole('Ah 5h'), parseCards('Kh 8h 3c 2s 9d'), null)).toBeNull();
    expect(outs(hole('Ah 5h'), [], null)).toBeNull();
  });
});

describe('blockers', () => {
  const board = parseCards('Kd 7c 2s');

  function only(text: string): Float32Array {
    const weights = new Float32Array(PAIRS);
    const [a, b] = hole(text);
    weights[pairIndex(a, b)] = 1;
    return weights;
  }

  it('is the share of the strong range that holds a hero card', () => {
    expect(blockers(only('Kc Kh'), hole('Kh Qs'), board)).toBe(1);
    expect(blockers(only('Kc Kh'), hole('Ah Qh'), board)).toBe(0);
  });

  it('blocks part of the trips on a paired board', () => {
    const share = blockers(new Float32Array(PAIRS).fill(1), hole('Ks 4c'), parseCards('Kh Kd 7c'));
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
  });

  it('is null preflop and without a strong range', () => {
    expect(blockers(only('Kc Kh'), hole('Ah Qh'), [])).toBeNull();
    expect(blockers(only('3c 4h'), hole('Ah Qh'), board)).toBeNull();
  });
});
