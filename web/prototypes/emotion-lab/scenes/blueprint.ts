import { parseCards } from '../../../src/cards/index.ts';
import type { Card } from '../../../src/cards/index.ts';
import { SHIPPED_STRATEGIES, loadCfrModel } from '../../../src/cfr/index.ts';
import type { CfrBot, CfrModel } from '../../../src/cfr/index.ts';
import type { Action } from '../../../src/engine/index.ts';
import type { ReadBytes } from '../../../src/cfr/strategies.ts';
import type { Hand } from './scenes.ts';

export type Ranges = (hand: Hand, after: number) => Float32Array | null;

const BIG_BLIND = 20;
const DEFAULT_STACK_BB = 100;
const BOARD = { flop: 3, turn: 4, river: 5 } as const;
const DRAW = 0.5;

function actionOf(kind: string, toBb: string | undefined): Action {
  switch (kind) {
    case 'raise':
      return { kind: 'raise', to: Number(toBb) * BIG_BLIND };
    case 'call':
      return { kind: 'call' };
    case 'check':
      return { kind: 'check' };
    default:
      return { kind: 'fold' };
  }
}

function play(bot: CfrBot, board: readonly Card[], step: string): void {
  const [who = '', kind = '', toBb] = step.split(' ');
  if (who in BOARD) {
    bot.street(board.slice(0, BOARD[who as keyof typeof BOARD]));
    return;
  }
  bot.acted(who === 'her', actionOf(kind, toBb), DRAW);
}

function rangeAfter(model: CfrModel, hand: Hand, after: number): Float32Array | null {
  const line = hand.line ?? [];
  const stack = (hand.stackBb ?? DEFAULT_STACK_BB) * BIG_BLIND;
  const bot = model.newBot();
  bot.handStarted({
    heroOnButton: line[0]?.startsWith('her') ?? false,
    heroStack: stack,
    villainStack: stack,
    smallBlind: BIG_BLIND / 2,
    bigBlind: BIG_BLIND,
  });
  bot.holeCards(parseCards(hand.hero) as [Card, Card]);
  const board = parseCards(hand.board.join(' '));
  for (const step of line.slice(0, after)) {
    play(bot, board, step);
  }
  const range = bot.opponentRange();
  bot.free();
  return range;
}

export function blueprintRanges(model: CfrModel): Ranges {
  const known = new Map<string, Float32Array | null>();
  return (hand, after) => {
    const key = `${hand.hero}|${hand.board.join(' ')}|${(hand.line ?? []).join(',')}|${after}`;
    if (!known.has(key)) {
      known.set(key, rangeAfter(model, hand, after));
    }
    return known.get(key) ?? null;
  };
}

export async function loadBlueprint(read: ReadBytes): Promise<Ranges | null> {
  try {
    return blueprintRanges(await loadCfrModel(SHIPPED_STRATEGIES.cfr.url, read));
  } catch {
    return null;
  }
}
