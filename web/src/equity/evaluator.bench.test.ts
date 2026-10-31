import { expect, it } from 'vitest';
import { fullDeck, mulberry32, shuffle } from '../cards/index.ts';
import { pheEvaluator } from './evaluator.ts';

it('ranks one million seven-card hands in under 1500 ms', () => {
  const rng = mulberry32(7);
  const deck = fullDeck();
  const hands = Array.from({ length: 1000 }, () => shuffle(deck, rng).slice(0, 7));
  let sink = 0;
  const start = process.hrtime.bigint();
  for (let i = 0; i < 1000; i++) {
    for (let j = 0; j < 1000; j++) {
      sink += pheEvaluator.rank(hands[j] ?? []);
    }
  }
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  expect(sink).toBeGreaterThan(0);
  if (!process.env.CI) {
    expect(elapsedMs).toBeLessThan(1500);
  }
});
