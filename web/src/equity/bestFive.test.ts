import { describe, expect, it } from 'vitest';
import { formatCard, parseCards } from '../cards/index.ts';
import { bestFive } from './bestFive.ts';
import { pheEvaluator } from './evaluator.ts';

const best = (text: string) => bestFive(parseCards(text)).map(formatCard).sort();
const sorted = (text: string) => text.split(' ').sort();

describe('bestFive', () => {
  it('keeps two pair with the best kicker', () => {
    expect(best('Ks 8d As Th 3h Ad Ts')).toEqual(sorted('Ks As Th Ad Ts'));
  });

  it('finds a flush among seven cards', () => {
    expect(best('As Ks 9s 7s 4s 3d 2h')).toEqual(sorted('As Ks 9s 7s 4s'));
  });

  it('finds the wheel', () => {
    expect(best('As 2d 3h 4c 5d Kh Qc')).toEqual(sorted('As 2d 3h 4c 5d'));
  });

  it('returns five cards ranked as the whole hand', () => {
    const cards = parseCards('Jc 4d Js Jh 9d 9s 2c');
    expect(bestFive(cards)).toHaveLength(5);
    expect(pheEvaluator.rank(bestFive(cards))).toBe(pheEvaluator.rank(cards));
  });

  it('returns fewer than five cards as they are', () => {
    expect(best('As Kd')).toEqual(sorted('As Kd'));
  });
});
