import type { Card } from '../cards/index.ts';
import type { WeightedHands } from '../equity/index.ts';

const DECK = 52;

export function liveRange(weights: ArrayLike<number>, dead: readonly Card[]): WeightedHands {
  const hands: Array<{ cards: readonly [Card, Card]; weight: number }> = [];
  for (let b = 1; b < DECK; b++) {
    for (let a = 0; a < b; a++) {
      const weight = weights[(b * (b - 1)) / 2 + a] ?? 0;
      if (weight > 0 && !dead.includes(a) && !dead.includes(b)) {
        hands.push({ cards: [a, b], weight });
      }
    }
  }
  return hands;
}
