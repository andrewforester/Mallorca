import { rankOf, suitOf } from '../cards/index.ts';
import type { Card } from '../cards/index.ts';

export const PAIRS = 1326;
export const CELLS = 169;
const SIDE = 13;
const ACE = 14;
const RANKS = 'AKQJT98765432';

export function pairIndex(a: Card, b: Card): number {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return (hi * (hi - 1)) / 2 + lo;
}

export function pairCards(index: number): [Card, Card] {
  let hi = 1;
  while (((hi + 1) * hi) / 2 <= index) {
    hi += 1;
  }
  return [index - (hi * (hi - 1)) / 2, hi];
}

export function cellOf(a: Card, b: Card): number {
  const high = ACE - Math.max(rankOf(a), rankOf(b));
  const low = ACE - Math.min(rankOf(a), rankOf(b));
  if (high === low) {
    return high * SIDE + high;
  }
  return suitOf(a) === suitOf(b) ? high * SIDE + low : low * SIDE + high;
}

export function cellName(cell: number): string {
  const row = Math.floor(cell / SIDE);
  const col = cell % SIDE;
  if (row === col) {
    return `${RANKS[row]}${RANKS[row]}`;
  }
  const [high, low] = row < col ? [row, col] : [col, row];
  return `${RANKS[high]}${RANKS[low]}${row < col ? 's' : 'o'}`;
}

export function isLive(index: number, dead: readonly Card[]): boolean {
  const [a, b] = pairCards(index);
  return !dead.includes(a) && !dead.includes(b);
}

export function foldGrid(
  values: ArrayLike<number>,
  width: number,
  dead: readonly Card[],
): (number[] | null)[] {
  const sums = Array.from({ length: CELLS }, () => new Array<number>(width).fill(0));
  const counts = new Array<number>(CELLS).fill(0);
  for (let i = 0; i < PAIRS; i++) {
    if (!isLive(i, dead)) continue;
    const [a, b] = pairCards(i);
    const cell = cellOf(a, b);
    counts[cell] = (counts[cell] ?? 0) + 1;
    const sum = sums[cell] ?? [];
    for (let k = 0; k < width; k++) {
      sum[k] = (sum[k] ?? 0) + (values[i * width + k] ?? 0);
    }
  }
  return sums.map((sum, cell) => {
    const count = counts[cell] ?? 0;
    return count === 0 ? null : sum.map((value) => value / count);
  });
}
