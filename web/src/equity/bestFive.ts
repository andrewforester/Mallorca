import type { Card } from '../cards/index.ts';
import { pheEvaluator } from './evaluator.ts';

function fives(cards: readonly Card[]): Card[][] {
  const out: Card[][] = [];
  const pick = (start: number, chosen: Card[]) => {
    if (chosen.length === 5) {
      out.push(chosen);
      return;
    }
    for (let i = start; i <= cards.length - (5 - chosen.length); i += 1) {
      pick(i + 1, [...chosen, cards[i] as Card]);
    }
  };
  pick(0, []);
  return out;
}

export function bestFive(cards: readonly Card[]): Card[] {
  if (cards.length <= 5) {
    return [...cards];
  }
  let best: Card[] = [];
  let bestRank = -Infinity;
  for (const five of fives(cards)) {
    const rank = pheEvaluator.rank(five);
    if (rank > bestRank) {
      best = five;
      bestRank = rank;
    }
  }
  return best;
}
