import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Rng } from '../cards/index.ts';
import { fullDeck, mulberry32, parseCards, shuffle } from '../cards/index.ts';
import type { Action, LegalActions, Seat, SeatIndex, Step } from '../engine/index.ts';
import { applyAction, legalActions, startHandWith } from '../engine/index.ts';
import { toObservations } from '../brains/index.ts';
import type { CfrModel } from './index.ts';
import { SHIPPED_STRATEGIES, WASM_URL, createCfrBrain, createCfrModel, inflate } from './index.ts';

const wasm = readFileSync(WASM_URL);
const strategy = readFileSync(SHIPPED_STRATEGIES.cfr.url);

let model: CfrModel;

beforeAll(async () => {
  model = await createCfrModel(wasm, await inflate(strategy));
});

function isLegal(action: Action, legal: LegalActions): boolean {
  switch (action.kind) {
    case 'fold':
      return legal.fold;
    case 'check':
      return legal.check;
    case 'call':
      return legal.call !== null;
    case 'raise':
      return legal.raise !== null && action.to >= legal.raise.min && action.to <= legal.raise.max;
  }
}

function randomAction(legal: LegalActions, rng: Rng): Action {
  const options: Action[] = [];
  if (legal.fold) options.push({ kind: 'fold' });
  if (legal.check) options.push({ kind: 'check' });
  if (legal.call !== null) options.push({ kind: 'call' });
  if (legal.raise !== null) {
    const { min, max } = legal.raise;
    options.push({ kind: 'raise', to: min + Math.floor(rng.next() * (max - min + 1)) });
    options.push({ kind: 'raise', to: max });
  }
  return options[Math.floor(rng.next() * options.length)] ?? { kind: 'check' };
}

function playHand(seed: number, stacks: [number, number], big: number, using = model): Action[] {
  const rng = mulberry32(seed);
  const brain = createCfrBrain(using, mulberry32(seed + 1));
  const seats: [Seat, Seat] = [
    { name: 'cfr', stack: stacks[0] },
    { name: 'random', stack: stacks[1] },
  ];
  const button = (seed % 2) as SeatIndex;
  const deck = shuffle(fullDeck(), rng);
  const blinds = { small: big / 2, big };
  let step: Step = startHandWith(seats, { button, blinds, handNumber: 1 }, deck);
  const feed = (s: Step) => toObservations(s.events, 0).forEach((o) => brain.observe(o));
  feed(step);
  const played: Action[] = [];
  while (step.hand.street !== 'complete') {
    const legal = legalActions(step.hand, step.seats);
    const mine = step.hand.toAct === 0;
    const action = mine ? brain.decide(legal).action : randomAction(legal, rng);
    if (mine) {
      expect(isLegal(action, legal), JSON.stringify({ action, legal })).toBe(true);
      played.push(action);
    }
    step = applyAction(step.hand, step.seats, action);
    feed(step);
  }
  brain.dispose();
  return played;
}

describe('inflate', () => {
  it('inflates gzip and passes other bytes through', async () => {
    const raw = new Uint8Array([1, 2, 3, 250]);
    expect(await inflate(new Uint8Array(gzipSync(raw)))).toEqual(raw);
    expect(await inflate(raw)).toEqual(raw);
  });
});

describe('createCfrModel', () => {
  it('refuses bytes that are not a strategy file', async () => {
    await expect(createCfrModel(wasm, new Uint8Array(100))).rejects.toThrow(/not a strategy file/);
  });
});

describe('CfrBrain', () => {
  it('plays only legal actions at any stack and blind', () => {
    const rng = mulberry32(99);
    for (let seed = 1; seed <= 150; seed++) {
      const big = [20, 40, 200][seed % 3] ?? 20;
      const depth = (): number => big * (3 + Math.floor(rng.next() * 200));
      playHand(seed, [depth(), depth()], big);
    }
  });

  it('plays the v2 blueprint legally', async () => {
    const v2 = await createCfrModel(
      wasm,
      await inflate(readFileSync(SHIPPED_STRATEGIES['cfr-v2'].url)),
    );
    for (let seed = 1; seed <= 30; seed++) {
      playHand(seed, [2000, 2000], 20, v2);
    }
  }, 60_000);

  it('is reproducible from its seed', () => {
    expect(playHand(7, [2000, 2000], 20)).toEqual(playHand(7, [2000, 2000], 20));
  });

  it('never folds aces before the flop', () => {
    for (let seed = 0; seed < 40; seed++) {
      const brain = createCfrBrain(model, mulberry32(seed));
      brain.observe({
        type: 'handStarted',
        handNumber: 1,
        heroOnButton: true,
        heroStack: 2000,
        villainStack: 2000,
        smallBlind: 10,
        bigBlind: 20,
      });
      const [a, b] = parseCards('As Ah');
      brain.observe({ type: 'holeCards', cards: [a ?? 0, b ?? 0] });
      const decision = brain.decide({
        fold: true,
        check: false,
        call: 10,
        raise: { min: 40, max: 2000 },
      });
      expect(decision.action.kind).not.toBe('fold');
      expect(Number.isFinite(decision.evByAction.fold)).toBe(false);
      brain.dispose();
    }
  });
});
