import type { Card } from '../cards/index.ts';
import { bestFive, pheEvaluator } from '../equity/index.ts';
import type { SeatIndex, ShowdownHand } from './types.ts';

export function awardShowdown(
  pot: number,
  ranks: readonly [number, number],
  bigBlindSeat: SeatIndex,
): [number, number] {
  if (ranks[0] > ranks[1]) {
    return [pot, 0];
  }
  if (ranks[1] > ranks[0]) {
    return [0, pot];
  }
  const half = Math.floor(pot / 2);
  const shares: [number, number] = [half, half];
  shares[bigBlindSeat] += pot - 2 * half;
  return shares;
}

export function evaluateShowdown(
  holeCards: readonly [[Card, Card], [Card, Card]],
  board: readonly Card[],
): [ShowdownHand, ShowdownHand] {
  const hand = (seat: SeatIndex): ShowdownHand => {
    const cards = [...holeCards[seat], ...board];
    const rank = pheEvaluator.rank(cards);
    return {
      cards: holeCards[seat],
      rank,
      category: pheEvaluator.category(rank),
      best: bestFive(cards),
    };
  };
  return [hand(0), hand(1)];
}
