import { rankOf, suitOf } from '../cards/index.ts';
import type { Card } from '../cards/index.ts';
import { pheEvaluator } from '../equity/index.ts';
import type { HandCategory } from '../equity/index.ts';
import { PAIRS, isLive, pairCards } from './grid.ts';

export type HandClass = 'strong' | 'twoPair' | 'topPair' | 'pair' | 'draw' | 'air';

export const HAND_CLASSES: readonly HandClass[] = [
  'strong',
  'twoPair',
  'topPair',
  'pair',
  'draw',
  'air',
];

export interface Composition {
  shares: Record<HandClass, number>;
  ahead: number;
}

const FLOP = 3;
const RIVER = 5;
const ACE = 14;
const STRAIGHT = 5;
const MADE: ReadonlySet<HandCategory> = new Set([
  'straight',
  'flush',
  'full-house',
  'quads',
  'straight-flush',
]);

function count(values: readonly number[], value: number): number {
  return values.filter((v) => v === value).length;
}

function flushDraw(hole: [Card, Card], board: readonly Card[]): boolean {
  const cards = [...hole, ...board];
  return hole.some((card) => count(cards.map(suitOf), suitOf(card)) === STRAIGHT - 1);
}

function lowAce(ranks: readonly number[]): Set<number> {
  const set = new Set(ranks);
  if (set.has(ACE)) set.add(1);
  return set;
}

function completes(present: Set<number>, extra: number, hole: Set<number>): boolean {
  for (
    let low = Math.max(1, extra - STRAIGHT + 1);
    low <= Math.min(extra, ACE - STRAIGHT + 1);
    low++
  ) {
    let full = true;
    let usesHole = false;
    for (let r = low; r < low + STRAIGHT; r++) {
      full &&= r === extra || present.has(r);
      usesHole ||= hole.has(r) && r !== extra;
    }
    if (full && usesHole) return true;
  }
  return false;
}

function straightDraw(hole: [Card, Card], board: readonly Card[]): boolean {
  const present = lowAce([...hole, ...board].map(rankOf));
  const holeRanks = lowAce(hole.map(rankOf));
  let ways = 0;
  for (let extra = 2; extra <= ACE; extra++) {
    const wheel = extra === ACE && completes(present, 1, holeRanks);
    if (!present.has(extra) && (wheel || completes(present, extra, holeRanks))) ways += 1;
  }
  return ways >= 2;
}

function pairClass(hole: [Card, Card], board: readonly Card[]): HandClass | null {
  const boardRanks = board.map(rankOf);
  const [a, b] = [rankOf(hole[0]), rankOf(hole[1])];
  if (a === b) {
    if (boardRanks.includes(a)) return 'strong';
    return a >= Math.max(...boardRanks) ? 'topPair' : 'pair';
  }
  if (count(boardRanks, a) >= 2 || count(boardRanks, b) >= 2) return 'strong';
  const paired = [a, b].filter((r) => boardRanks.includes(r));
  if (paired.length === 2) return 'twoPair';
  if (paired.length === 1) return (paired[0] ?? 0) >= Math.max(...boardRanks) ? 'topPair' : 'pair';
  return null;
}

export function classify(hole: [Card, Card], board: readonly Card[]): HandClass {
  const category = pheEvaluator.category(pheEvaluator.rank([...hole, ...board]));
  if (MADE.has(category)) return 'strong';
  const made = pairClass(hole, board);
  if (made !== null) return made;
  if (board.length < RIVER && (flushDraw(hole, board) || straightDraw(hole, board))) return 'draw';
  return 'air';
}

function emptyShares(): Record<HandClass, number> {
  return { strong: 0, twoPair: 0, topPair: 0, pair: 0, draw: 0, air: 0 };
}

export function composition(
  weights: ArrayLike<number>,
  hero: [Card, Card],
  board: readonly Card[],
): Composition | null {
  if (board.length < FLOP) return null;
  const dead = [...hero, ...board];
  const mine = pheEvaluator.rank(dead);
  const shares = emptyShares();
  let total = 0;
  let ahead = 0;
  for (let i = 0; i < PAIRS; i++) {
    const weight = weights[i] ?? 0;
    if (weight <= 0 || !isLive(i, dead)) continue;
    const cards = pairCards(i);
    const theirs = pheEvaluator.rank([...cards, ...board]);
    shares[classify(cards, board)] += weight;
    ahead += weight * (mine > theirs ? 1 : mine === theirs ? 0.5 : 0);
    total += weight;
  }
  if (total === 0) return null;
  for (const name of HAND_CLASSES) shares[name] /= total;
  return { shares, ahead: ahead / total };
}
