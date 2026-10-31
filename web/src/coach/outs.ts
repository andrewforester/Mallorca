import { fullDeck, rankOf } from '../cards/index.ts';
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

const FULL_HOUSE = ORDER.indexOf('full-house');
const QUADS = ORDER.indexOf('quads');
const TRIPS = ORDER.indexOf('trips');
const TWO_PAIR = ORDER.indexOf('two-pair');
const PAIR = ORDER.indexOf('pair');

function boardCategory(board: readonly Card[]): number {
  if (board.length >= RIVER) return categoryIndex(board);
  const counts = new Map<number, number>();
  for (const card of board) counts.set(rankOf(card), (counts.get(rankOf(card)) ?? 0) + 1);
  const sizes = [...counts.values()].sort((a, b) => b - a);
  const [first = 0, second = 0] = sizes;
  if (first >= 4) return QUADS;
  if (first === 3) return second >= 2 ? FULL_HOUSE : TRIPS;
  if (first === 2) return second === 2 ? TWO_PAIR : PAIR;
  return 0;
}

function isOut(hero: [Card, Card], board: readonly Card[], next: Card[], now: number): boolean {
  const reached = categoryIndex([...hero, ...next]);
  if (reached <= now) return false;
  const margin = reached - boardCategory(next);
  if (margin > now - boardCategory(board)) return true;
  return (
    margin === 0 &&
    next.length === RIVER &&
    pheEvaluator.rank([...hero, ...next]) > pheEvaluator.rank(next)
  );
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
    return isOut(hero, board, next, now) && aheadShare(hero, next, weights) > 0.5;
  });
  const n = cards.length;
  const nextCard = n / unseen.length;
  const byRiver = board.length === FLOP ? 1 - (1 - nextCard) * (1 - n / (unseen.length - 1)) : null;
  return { cards, nextCard, byRiver };
}
