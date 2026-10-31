import { describe, expect, it } from 'vitest';
import { mulberry32, parseCards } from '../cards/index.ts';
import { equityVsHand, equityVsRange } from './equity.ts';
import type { WeightedHands } from './equity.ts';

const hand = (text: string) => parseCards(text) as [number, number];

describe('equityVsHand', () => {
  it('matches the known preflop value of aces against kings', () => {
    expect(Math.abs(equityVsHand(hand('As Ah'), hand('Ks Kd'), []) - 0.8209)).toBeLessThan(0.005);
  });

  it('is 0, 0.5 or 1 on a complete board', () => {
    const board = parseCards('2c 7d 9h Js Qd');
    expect(equityVsHand(hand('As Ah'), hand('Ks Kh'), board)).toBe(1);
    expect(equityVsHand(hand('Ks Kh'), hand('As Ah'), board)).toBe(0);
    expect(equityVsHand(hand('As 3h'), hand('Ad 3c'), board)).toBe(0.5);
  });

  it('counts a tie as half on the turn', () => {
    const board = parseCards('2c 7d 9h Js');
    expect(equityVsHand(hand('As Kh'), hand('Ad Kc'), board)).toBe(0.5);
  });

  it('adds the flush draw to a shared hand on the turn', () => {
    const board = parseCards('Qs 7s 2d 9h');
    const value = equityVsHand(hand('As Ks'), hand('Ad Kc'), board);
    expect(value).toBeGreaterThan(0.5);
    expect(value).toBeLessThan(1);
  });
});

describe('equityVsRange', () => {
  const single = (text: string): WeightedHands => [{ cards: hand(text), weight: 1 }];

  it('equals equityVsHand exactly on the turn', () => {
    const board = parseCards('2c 7d 9h Js');
    const exact = equityVsHand(hand('As Ah'), hand('Ks Kh'), board);
    expect(
      equityVsRange(hand('As Ah'), single('Ks Kh'), board, { rng: mulberry32(1), samples: 10 }),
    ).toBe(exact);
  });

  it('is within 0.01 of equityVsHand preflop with 20000 samples', () => {
    const exact = equityVsHand(hand('As Ah'), hand('Ks Kd'), []);
    const sampled = equityVsRange(hand('As Ah'), single('Ks Kd'), [], {
      rng: mulberry32(1),
      samples: 20000,
    });
    expect(Math.abs(sampled - exact)).toBeLessThan(0.01);
  });

  it('weights villain hands and skips those blocked by hero or board', () => {
    const board = parseCards('2c 7d 9h Js');
    const range: WeightedHands = [
      { cards: hand('Ks Kh'), weight: 3 },
      { cards: hand('As Qd'), weight: 5 },
      { cards: hand('Jd Jc'), weight: 1 },
    ];
    const opts = { rng: mulberry32(1), samples: 10 };
    const a = equityVsHand(hand('As Ah'), hand('Ks Kh'), board);
    const c = equityVsHand(hand('As Ah'), hand('Jd Jc'), board);
    expect(equityVsRange(hand('As Ah'), range, board, opts)).toBeCloseTo((3 * a + c) / 4, 12);
  });
});
