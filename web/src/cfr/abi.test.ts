import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Action, LegalActions } from '../engine/index.ts';
import type { CfrBot, CfrModel } from './model.ts';
import { createCfrModel, inflate } from './model.ts';
import { SHIPPED_STRATEGIES, WASM_URL } from './strategies.ts';

const wasm = readFileSync(WASM_URL);

let play: Uint8Array;
let model: CfrModel;

beforeAll(async () => {
  play = await inflate(readFileSync(SHIPPED_STRATEGIES.cfr.url));
  model = await createCfrModel(wasm, play);
});

const VERSION = 4;
const TREE = 63;
const FLOP_BUCKETS = 128;
const KIND_THRESHOLDS = 1;

function u32(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(at, true);
}

function sectionStart(bytes: Uint8Array): number {
  return TREE + 4 + u32(bytes, TREE) + 4;
}

function withSection(bytes: Uint8Array, section: Uint8Array): Uint8Array {
  const start = sectionStart(bytes);
  const rest = bytes.subarray(start + u32(bytes, start - 4));
  const out = new Uint8Array(start + section.length + rest.length);
  out.set(bytes.subarray(0, start));
  new DataView(out.buffer).setUint32(start - 4, section.length, true);
  out.set(section, start);
  out.set(rest, start + section.length);
  return out;
}

function flopAsThresholds(bytes: Uint8Array): Uint8Array {
  const start = sectionStart(bytes);
  const section = bytes.subarray(start, start + u32(bytes, start - 4));
  const flopEnd = 1 + 4 + u32(section, 1);
  const count = FLOP_BUCKETS - 1;
  const head = new Uint8Array(1 + 2 + count * 4);
  const view = new DataView(head.buffer);
  view.setUint8(0, KIND_THRESHOLDS);
  view.setUint16(1, count, true);
  for (let i = 0; i < count; i++) view.setFloat32(3 + i * 4, i / count, true);
  const out = new Uint8Array(head.length + section.length - flopEnd);
  out.set(head);
  out.set(section.subarray(flopEnd), head.length);
  return withSection(bytes, out);
}

function flopBucket(bytes: Uint8Array, bucket: number): Uint8Array {
  const out = bytes.slice();
  out[sectionStart(bytes) + 1 + 4] = bucket;
  return out;
}

function loadError(strategy: Uint8Array): Promise<string> {
  return createCfrModel(wasm, strategy).then(
    () => 'loaded',
    (e: unknown) => (e instanceof Error ? e.message : String(e)),
  );
}

describe('the load error codes of mallorca.wasm', () => {
  it('reports bad magic (-1)', async () => {
    expect(await loadError(new Uint8Array(100))).toBe('not a strategy file (bad magic)');
  });

  it('reports an unknown format version (-2)', async () => {
    const bytes = play.slice();
    bytes[VERSION] = 99;
    expect(await loadError(bytes)).toBe('unknown strategy format version');
  });

  it('reports a truncated file (-3)', async () => {
    expect(await loadError(play.slice(0, 40))).toBe('strategy file is truncated');
  });

  it('reports an inconsistent file (-4)', async () => {
    const bytes = new Uint8Array(play.length + 1);
    bytes.set(play);
    expect(await loadError(bytes)).toBe('strategy file is inconsistent');
  });

  it('reports a missing street (-5)', async () => {
    expect(await loadError(flopAsThresholds(play))).toBe(
      'strategy file lacks a street the bot needs',
    );
  });

  it('reports a bucket beyond the tree (-6)', async () => {
    expect(await loadError(flopBucket(play, FLOP_BUCKETS))).toBe(
      'strategy file has a bucket beyond the tree',
    );
  });

  it('loads the untouched file', async () => {
    expect(await loadError(play)).toBe('loaded');
  });
});

function preflopBot(): CfrBot {
  const bot = model.newBot();
  bot.handStarted({
    heroOnButton: true,
    heroStack: 2000,
    villainStack: 2000,
    smallBlind: 10,
    bigBlind: 20,
  });
  bot.holeCards([48, 49]);
  return bot;
}

const SPOTS: [string, LegalActions, Action][] = [
  ['fold', { fold: true, check: false, call: null, raise: null }, { kind: 'fold' }],
  ['check', { fold: false, check: true, call: null, raise: null }, { kind: 'check' }],
  ['call', { fold: false, check: false, call: 10, raise: null }, { kind: 'call' }],
  [
    'raise',
    { fold: true, check: false, call: 10, raise: { min: 40, max: 2000 } },
    { kind: 'raise', to: 50 },
  ],
];

describe('the action kinds of mallorca.wasm', () => {
  for (const [name, legal, action] of SPOTS) {
    it(`reads ${name} from aces on the button before the flop`, () => {
      const bot = preflopBot();
      expect(bot.decide(legal, 0.5)).toEqual(action);
      bot.free();
    });
  }
});

function pairIndex(a: number, b: number): number {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return (hi * (hi - 1)) / 2 + lo;
}

const OPEN: LegalActions = { fold: true, check: false, call: 10, raise: { min: 40, max: 2000 } };

describe('the coach exports of mallorca.wasm', () => {
  it('gives a uniform range before the bot acts', () => {
    const bot = preflopBot();
    const range = bot.range();
    expect(range?.length).toBe(1326);
    expect(range?.every((w) => w === 1)).toBe(true);
    bot.free();
  });

  it('gives the spot and the strategy of aces on the button', () => {
    const bot = preflopBot();
    const spot = bot.spot(OPEN);
    expect(spot?.approximate).toBe(false);
    const n = spot?.moves.length ?? 0;
    expect(n).toBeGreaterThan(1);
    expect(spot?.grid.length).toBe(1326 * n);
    for (const move of spot?.moves ?? []) {
      if (move.kind === 'raise') {
        expect(move.to).toBeGreaterThanOrEqual(40);
        expect(move.to).toBeLessThanOrEqual(2000);
      } else {
        expect(['fold', 'call']).toContain(move.kind);
      }
    }
    const row = Array.from(
      spot?.grid.subarray(pairIndex(50, 51) * n, (pairIndex(50, 51) + 1) * n) ?? [],
    );
    expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    const best = row.indexOf(Math.max(...row));
    expect(spot?.moves[best]?.kind).toBe('raise');
    bot.free();
  });

  it('narrows the range after the bot opens and drops the flop cards', () => {
    const bot = preflopBot();
    const open = bot.decide(OPEN, 0.5);
    bot.acted(true, open, 0.5);
    bot.acted(false, { kind: 'call' }, 0.5);
    const flop = [0, 21, 38];
    bot.street(flop);
    const range = bot.range() ?? new Float32Array();
    const live: number[] = [];
    for (let b = 1; b < 52; b++) {
      for (let a = 0; a < b; a++) {
        const w = range[pairIndex(a, b)] ?? -1;
        if (flop.includes(a) || flop.includes(b)) {
          expect(w).toBe(0);
        } else {
          live.push(w);
        }
      }
    }
    expect(new Set(live).size).toBeGreaterThan(1);
    bot.free();
  });

  it("narrows the player's range after his call and drops her cards", () => {
    const bot = preflopBot();
    const before = bot.opponentRange() ?? new Float32Array();
    const open = bot.decide(OPEN, 0.5);
    bot.acted(true, open, 0.5);
    bot.acted(false, { kind: 'call' }, 0.5);
    const after = bot.opponentRange() ?? new Float32Array();
    expect(after.length).toBe(1326);
    expect([before[pairIndex(48, 49)], after[pairIndex(48, 49)]]).toEqual([0, 0]);
    expect(before.every((w) => w === 0 || w === 1)).toBe(true);
    expect(after.some((w) => w > 0 && w < 1)).toBe(true);
    bot.free();
  });

  it('answers null for a freed bot', () => {
    const bot = preflopBot();
    bot.free();
    expect(bot.range()).toBeNull();
    expect(bot.opponentRange()).toBeNull();
    expect(bot.spot(OPEN)).toBeNull();
  });
});
