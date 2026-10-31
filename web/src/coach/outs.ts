import { fullDeck } from '../cards/index.ts';
import type { Card } from '../cards/index.ts';
import { pheEvaluator } from '../equity/index.ts';
import type { HandCategory } from '../equity/index.ts';
import { PAIRS, isLive, pairCards } from './grid.ts';

export interface Outs {
  cards: Card[];
  nextCard: number;
  byRiver: number | null;
}

const ORDER: readonly HandCategory[] = [
  'high-card',
  'pair',
  'two-pair',
  'trips',
  'straight',
  'flush',
  'full-house',
  'quads',
  'straight-flush',
];
const FLOP = 3;
const RIVER = 5;

function categoryIndex(cards: readonly Card[]): number {
  return ORDER.indexOf(pheEvaluator.category(pheEvaluator.rank(cards)));
}

function aheadShare(
  hero: [Card, Card],
  board: readonly Card[],
  weights: ArrayLike<number> | null,
): number {
  const dead = [...hero, ...board];
  const mine = pheEvaluator.rank(dead);
  let total = 0;
  let ahead = 0;
  for (let i = 0; i < PAIRS; i++) {
    const weight = weights === null ? 1 : (weights[i] ?? 0);
    if (weight <= 0 || !isLive(i, dead)) continue;
    const theirs = pheEvaluator.rank([...pairCards(i), ...board]);
    ahead += weight * (mine > theirs ? 1 : mine === theirs ? 0.5 : 0);
    total += weight;
  }
  return total === 0 ? 0 : ahead / total;
}

export function outs(
  hero: [Card, Card],
  board: readonly Card[],
  weights: ArrayLike<number> | null,
): Outs | null {
  if (board.length < FLOP || board.length >= RIVER) return null;
  const now = categoryIndex([...hero, ...board]);
  const unseen = fullDeck().filter((card) => !hero.includes(card) && !board.includes(card));
  const cards = unseen.filter((card) => {
    const next = [...board, card];
    return categoryIndex([...hero, ...next]) > now && aheadShare(hero, next, weights) > 0.5;
  });
  const n = cards.length;
  const nextCard = n / unseen.length;
  const byRiver = board.length === FLOP ? 1 - (1 - nextCard) * (1 - n / (unseen.length - 1)) : null;
  return { cards, nextCard, byRiver };
}
