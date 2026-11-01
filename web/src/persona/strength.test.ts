import { describe, expect, it } from 'vitest';
import { mulberry32, parseCards } from '../cards/index.ts';
import type { Card } from '../cards/index.ts';
import { strengthOf } from './strength.ts';

const hole = (text: string): [Card, Card] => parseCards(text) as [Card, Card];

describe('strengthOf', () => {
  it('rates aces preflop strong', () => {
    expect(strengthOf(hole('As Ah'), [], mulberry32(1))).toBe('strong');
  });

  it('rates seven deuce preflop weak', () => {
    expect(strengthOf(hole('7c 2d'), [], mulberry32(1))).toBe('weak');
  });

  it('rates a nut flush on the river strong', () => {
    expect(strengthOf(hole('Ah 2h'), parseCards('Kh 9h 5h 3c Jd'), mulberry32(1))).toBe('strong');
  });

  it('rates a missed draw on the river weak', () => {
    expect(strengthOf(hole('Ah 2h'), parseCards('Kd 9h 5h 3c Jd'), mulberry32(1))).toBe('weak');
  });

  it('gives the same class for the same seed', () => {
    const board = parseCards('Td 8c 4s');
    const first = strengthOf(hole('Qh Jh'), board, mulberry32(7));
    const second = strengthOf(hole('Qh Jh'), board, mulberry32(7));
    expect(second).toBe(first);
  });
});
