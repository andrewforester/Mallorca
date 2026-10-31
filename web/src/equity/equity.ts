import type { Card, Rng } from '../cards/index.ts';
import { fullDeck } from '../cards/index.ts';
import type { HandEvaluator } from './evaluator.ts';
import { pheEvaluator } from './evaluator.ts';

export type WeightedHands = ReadonlyArray<{ cards: readonly [Card, Card]; weight: number }>;

export interface EquityOptions {
  rng: Rng;
  samples: number;
}

const BOARD_SIZE = 5;

export function remainingDeck(dead: readonly Card[]): Card[] {
  const taken = new Set(dead);
  return fullDeck().filter((card) => !taken.has(card));
}

export function isBlocked(cards: readonly [Card, Card], dead: readonly Card[]): boolean {
  return dead.includes(cards[0]) || dead.includes(cards[1]);
}

function scoreShowdown(
  evaluator: HandEvaluator,
  hero: readonly [Card, Card],
  villain: readonly [Card, Card],
  board: readonly Card[],
): number {
  const heroRank = evaluator.rank([hero[0], hero[1], ...board]);
  const villainRank = evaluator.rank([villain[0], villain[1], ...board]);
  if (heroRank > villainRank) {
    return 1;
  }
  return heroRank === villainRank ? 0.5 : 0;
}

export function equityVsHand(
  hero: readonly [Card, Card],
  villain: readonly [Card, Card],
  board: readonly Card[],
  evaluator: HandEvaluator = pheEvaluator,
): number {
  const deck = remainingDeck([...hero, ...villain, ...board]);
  const missing = BOARD_SIZE - board.length;
  const full: Card[] = [...board, ...new Array<Card>(missing).fill(0)];
  let total = 0;
  let count = 0;
  const fill = (slot: number, from: number): void => {
    if (slot === BOARD_SIZE) {
      total += scoreShowdown(evaluator, hero, villain, full);
      count++;
      return;
    }
    for (let i = from; i < deck.length - (BOARD_SIZE - slot - 1); i++) {
      full[slot] = deck[i] as Card;
      fill(slot + 1, i + 1);
    }
  };
  fill(board.length, 0);
  return total / count;
}

function sampleEquity(
  hero: readonly [Card, Card],
  live: ReadonlyArray<{ cards: readonly [Card, Card]; weight: number }>,
  board: readonly Card[],
  opts: EquityOptions,
): number {
  const cumulative: number[] = [];
  let sum = 0;
  for (const entry of live) {
    sum += entry.weight;
    cumulative.push(sum);
  }
  const missing = BOARD_SIZE - board.length;
  let total = 0;
  for (let s = 0; s < opts.samples; s++) {
    const target = opts.rng.next() * sum;
    let low = 0;
    let high = live.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((cumulative[mid] as number) > target) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    const villain = (live[low] as (typeof live)[number]).cards;
    const pool = remainingDeck([...hero, ...villain, ...board]);
    const drawn: Card[] = [...board];
    for (let i = 0; i < missing; i++) {
      const j = i + Math.floor(opts.rng.next() * (pool.length - i));
      const picked = pool[j] as Card;
      pool[j] = pool[i] as Card;
      pool[i] = picked;
      drawn.push(picked);
    }
    total += scoreShowdown(pheEvaluator, hero, villain, drawn);
  }
  return total / opts.samples;
}

export function equityVsRange(
  hero: readonly [Card, Card],
  range: WeightedHands,
  board: readonly Card[],
  opts: EquityOptions,
): number {
  const dead = [...hero, ...board];
  const live = range.filter((entry) => entry.weight > 0 && !isBlocked(entry.cards, dead));
  if (board.length >= 4) {
    let total = 0;
    let weight = 0;
    for (const entry of live) {
      total += entry.weight * equityVsHand(hero, entry.cards, board);
      weight += entry.weight;
    }
    return total / weight;
  }
  if (live.length === 0) {
    return Number.NaN;
  }
  return sampleEquity(hero, live, board, opts);
}
