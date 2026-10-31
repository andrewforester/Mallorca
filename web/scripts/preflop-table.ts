import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { cardOf, fullDeck } from '../src/cards/index.ts';
import type { Suit } from '../src/cards/index.ts';
import { pheEvaluator } from '../src/equity/index.ts';

const VALUES = 13;
const SIZE = VALUES * VALUES;
const DECK = fullDeck();
const BOARD_SIZE = 5;
const CLUBS: Suit = 0;
const DIAMONDS: Suit = 1;
const HEARTS: Suit = 2;
const SPADES: Suit = 3;
const OUTPUT = new URL('../src/brains/data/preflop-strength.json', import.meta.url);

interface Task {
  hero: number;
}

interface Result {
  hero: number;
  strengths: number[];
}

const hands: Array<readonly [number, number]> = [];
for (let high = 0; high < VALUES; high++) {
  for (let low = 0; low <= high; low++) {
    hands.push([high, low]);
  }
}

const card = (value: number, suit: Suit): number => cardOf(value + 2, suit);
const indexOf = ([high, low]: readonly [number, number]): number => high * VALUES + low;

function strengthsOf(heroPosition: number): number[] {
  const [heroHigh, heroLow] = hands[heroPosition] as readonly [number, number];
  const hero = [card(heroHigh, CLUBS), card(heroLow, DIAMONDS)];
  const villains = hands
    .slice(heroPosition)
    .map(([high, low]) => [card(high, HEARTS), card(low, SPADES)]);
  const wins = new Array<number>(villains.length).fill(0);
  const draws = new Array<number>(villains.length).fill(0);
  const counts = new Array<number>(villains.length).fill(0);
  const deck = DECK.filter((c) => !hero.includes(c));
  const onBoard = new Uint8Array(DECK.length);
  const heroCards = [hero[0] as number, hero[1] as number, 0, 0, 0, 0, 0];
  const villainCards = [0, 0, 0, 0, 0, 0, 0];
  const board = new Array<number>(BOARD_SIZE).fill(0);
  const visit = (): void => {
    for (let k = 0; k < BOARD_SIZE; k++) {
      heroCards[2 + k] = board[k] as number;
      villainCards[2 + k] = board[k] as number;
      onBoard[board[k] as number] = 1;
    }
    const heroRank = pheEvaluator.rank(heroCards);
    for (let v = 0; v < villains.length; v++) {
      const [first, second] = villains[v] as [number, number];
      if (onBoard[first] === 1 || onBoard[second] === 1) {
        continue;
      }
      villainCards[0] = first;
      villainCards[1] = second;
      const villainRank = pheEvaluator.rank(villainCards);
      if (heroRank > villainRank) {
        wins[v] = (wins[v] as number) + 1;
      } else if (heroRank === villainRank) {
        draws[v] = (draws[v] as number) + 1;
      }
      counts[v] = (counts[v] as number) + 1;
    }
    for (let k = 0; k < BOARD_SIZE; k++) {
      onBoard[board[k] as number] = 0;
    }
  };
  const fill = (slot: number, from: number): void => {
    if (slot === BOARD_SIZE) {
      visit();
      return;
    }
    for (let i = from; i <= deck.length - (BOARD_SIZE - slot); i++) {
      board[slot] = deck[i] as number;
      fill(slot + 1, i + 1);
    }
  };
  fill(0, 0);
  return villains.map(
    (_, v) => ((draws[v] as number) / 2 + (wins[v] as number)) / (counts[v] as number),
  );
}

function truncate(value: number): number {
  return value === -1 ? value : Math.floor(value * 100) / 100;
}

function buildTable(results: Result[]): number[][] {
  const table = Array.from({ length: SIZE }, () => new Array<number>(SIZE).fill(-1));
  for (const { hero, strengths } of [...results].sort((a, b) => a.hero - b.hero)) {
    const heroIndex = indexOf(hands[hero] as readonly [number, number]);
    strengths.forEach((strength, offset) => {
      const villainIndex = indexOf(hands[hero + offset] as readonly [number, number]);
      (table[heroIndex] as number[])[villainIndex] = strength;
      (table[villainIndex] as number[])[heroIndex] = 1 - strength;
    });
  }
  return table.map((row) => row.map(truncate));
}

async function main(): Promise<void> {
  const started = process.hrtime.bigint();
  const queue = hands.map((_, hero) => hero);
  const results: Result[] = [];
  const workerCount = Math.max(1, Math.min(availableParallelism() - 1, queue.length));
  await Promise.all(
    Array.from(
      { length: workerCount },
      () =>
        new Promise<void>((resolve, reject) => {
          const worker = new Worker(new URL(import.meta.url));
          const next = (): void => {
            const hero = queue.shift();
            if (hero === undefined) {
              void worker.terminate().then(() => resolve());
              return;
            }
            worker.postMessage({ hero } satisfies Task);
          };
          worker.on('message', (result: Result) => {
            results.push(result);
            next();
          });
          worker.on('error', reject);
          next();
        }),
    ),
  );
  writeFileSync(OUTPUT, `${JSON.stringify(buildTable(results))}\n`);
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  console.log(
    `Wrote ${results.length} hero rows with ${workerCount} workers in ${seconds.toFixed(1)} s`,
  );
}

if (isMainThread) {
  await main();
} else {
  parentPort?.on('message', ({ hero }: Task) => {
    parentPort?.postMessage({ hero, strengths: strengthsOf(hero) } satisfies Result);
  });
}
