import type { Card } from '../cards/index.ts';
import { classify } from './composition.ts';
import { PAIRS, isLive, pairCards } from './grid.ts';

const FLOP = 3;

export function blockers(
  weights: ArrayLike<number>,
  hero: [Card, Card],
  board: readonly Card[],
): number | null {
  if (board.length < FLOP) return null;
  let strong = 0;
  let blocked = 0;
  for (let i = 0; i < PAIRS; i++) {
    const weight = weights[i] ?? 0;
    if (weight <= 0 || !isLive(i, board)) continue;
    const cards = pairCards(i);
    const kind = classify(cards, board);
    if (kind !== 'strong' && kind !== 'twoPair') continue;
    strong += weight;
    if (hero.includes(cards[0]) || hero.includes(cards[1])) blocked += weight;
  }
  return strong === 0 ? null : blocked / strong;
}
