import type { BotStyle } from '../brains/index.ts';
import type { Card } from '../cards/index.ts';
import type { Action, LegalActions } from '../engine/index.ts';

interface Exports {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  load(ptr: number, len: number): number;
  bot_new(model: number): number;
  bot_free(bot: number): void;
  hand_started(
    bot: number,
    button: number,
    hero: number,
    villain: number,
    sb: number,
    bb: number,
  ): void;
  hole_cards(bot: number, a: number, b: number): void;
  street(bot: number, n: number, c0: number, c1: number, c2: number, c3: number, c4: number): void;
  acted(bot: number, hero: number, kind: number, to: number, draw: number): void;
  decide(
    bot: number,
    fold: number,
    check: number,
    call: number,
    min: number,
    max: number,
    draw: number,
  ): number;
  decided_to(bot: number): number;
  bot_style(bot: number, aggression: number, bluff: number, tightness: number): void;
  bot_range(bot: number): number;
  bot_spot(
    bot: number,
    fold: number,
    check: number,
    call: number,
    min: number,
    max: number,
  ): number;
  bot_spot_grid(bot: number): number;
}

export interface HandStart {
  heroOnButton: boolean;
  heroStack: number;
  villainStack: number;
  smallBlind: number;
  bigBlind: number;
}

export interface CfrBot {
  handStarted(start: HandStart): void;
  holeCards(cards: [Card, Card]): void;
  street(board: readonly Card[]): void;
  acted(hero: boolean, action: Action, draw: number): void;
  decide(legal: LegalActions, draw: number): Action;
  setStyle(style: BotStyle): void;
  range(): Float32Array | null;
  spot(legal: LegalActions): CfrSpot | null;
  free(): void;
}

export interface CfrSpot {
  approximate: boolean;
  moves: Action[];
  grid: Float32Array;
}

export interface CfrModel {
  newBot(): CfrBot;
}

const KINDS = ['fold', 'check', 'call', 'raise'] as const;

const LOAD_ERRORS: Record<number, string> = {
  [-1]: 'not a strategy file (bad magic)',
  [-2]: 'unknown strategy format version',
  [-3]: 'strategy file is truncated',
  [-4]: 'strategy file is inconsistent',
  [-5]: 'strategy file lacks a street the bot needs',
  [-6]: 'strategy file has a bucket beyond the tree',
};

const GZIP = [0x1f, 0x8b];

export async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes[0] !== GZIP[0] || bytes[1] !== GZIP[1]) {
    return bytes;
  }
  const source = new Blob([bytes as BlobPart]).stream();
  const stream = source.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function kindOf(action: Action): number {
  return KINDS.indexOf(action.kind);
}

function toAction(kind: number, to: number): Action {
  switch (KINDS[kind]) {
    case 'fold':
      return { kind: 'fold' };
    case 'check':
      return { kind: 'check' };
    case 'call':
      return { kind: 'call' };
    case 'raise':
      return { kind: 'raise', to };
    default:
      throw new Error(`The CFR bot gave no action (${kind})`);
  }
}

const PAIRS = 1326;

type LegalArgs = [number, number, number, number, number];

function legalArgs({ fold, check, call, raise }: LegalActions): LegalArgs {
  return [fold ? 1 : 0, check ? 1 : 0, call ?? -1, raise?.min ?? -1, raise?.max ?? -1];
}

function floats(e: Exports, ptr: number, length: number): Float32Array | null {
  return ptr === 0 ? null : new Float32Array(e.memory.buffer, ptr, length).slice();
}

function readSpot(e: Exports, handle: number, legal: LegalActions): CfrSpot | null {
  const ptr = e.bot_spot(handle, ...legalArgs(legal));
  const count = floats(e, ptr, 2)?.[1] ?? 0;
  const head = floats(e, ptr, 2 + 2 * count);
  const grid = floats(e, e.bot_spot_grid(handle), PAIRS * count);
  if (head === null || grid === null) {
    return null;
  }
  const moves = Array.from({ length: count }, (_, k) =>
    toAction(head[2 + 2 * k] ?? -1, head[3 + 2 * k] ?? 0),
  );
  return { approximate: head[0] === 1, moves, grid };
}

function bot(e: Exports, handle: number): CfrBot {
  return {
    handStarted(s) {
      const button = s.heroOnButton ? 1 : 0;
      e.hand_started(handle, button, s.heroStack, s.villainStack, s.smallBlind, s.bigBlind);
    },
    holeCards([a, b]) {
      e.hole_cards(handle, a, b);
    },
    street(board) {
      const [c0 = 0, c1 = 0, c2 = 0, c3 = 0, c4 = 0] = board;
      e.street(handle, board.length, c0, c1, c2, c3, c4);
    },
    acted(hero, action, draw) {
      const to = action.kind === 'raise' ? action.to : 0;
      e.acted(handle, hero ? 1 : 0, kindOf(action), to, draw);
    },
    decide(legal, draw) {
      const kind = e.decide(handle, ...legalArgs(legal), draw);
      return toAction(kind, e.decided_to(handle));
    },
    setStyle({ aggression, bluff, tightness }) {
      e.bot_style(handle, aggression, bluff, tightness);
    },
    range() {
      return floats(e, e.bot_range(handle), PAIRS);
    },
    spot(legal) {
      return readSpot(e, handle, legal);
    },
    free() {
      e.bot_free(handle);
    },
  };
}

export async function createCfrModel(wasm: BufferSource, strategy: Uint8Array): Promise<CfrModel> {
  const { instance } = await WebAssembly.instantiate(wasm, {});
  const e = instance.exports as unknown as Exports;
  const ptr = e.alloc(strategy.length);
  new Uint8Array(e.memory.buffer, ptr, strategy.length).set(strategy);
  const model = e.load(ptr, strategy.length);
  if (model < 0) {
    throw new Error(LOAD_ERRORS[model] ?? `cannot load the strategy (${model})`);
  }
  return { newBot: () => bot(e, e.bot_new(model)) };
}
