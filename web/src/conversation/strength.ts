import type { Card, Rng } from '../cards/index.ts';
import { fullDeck } from '../cards/index.ts';
import type { WeightedHands } from '../equity/index.ts';
import { equityVsRange } from '../equity/index.ts';

export type StrengthClass = 'strong' | 'medium' | 'weak';

const SAMPLES = 400;
const STRONG_PREFLOP = 0.62;
const STRONG_POSTFLOP = 0.75;
const WEAK = 0.45;

function allHands(): WeightedHands {
  const deck = fullDeck();
  const hands: Array<{ cards: readonly [Card, Card]; weight: number }> = [];
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      hands.push({ cards: [deck[i] as Card, deck[j] as Card], weight: 1 });
    }
  }
  return hands;
}

export const ALL_HANDS = allHands();

export function strengthOf(
  hole: readonly [Card, Card],
  board: readonly Card[],
  rng: Rng,
): StrengthClass {
  const equity = equityVsRange(hole, ALL_HANDS, board, { rng, samples: SAMPLES });
  const strongAt = board.length === 0 ? STRONG_PREFLOP : STRONG_POSTFLOP;
  if (equity >= strongAt) {
    return 'strong';
  }
  return equity < WEAK ? 'weak' : 'medium';
}
