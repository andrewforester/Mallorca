import type { ChatSignal, Engine, Impulse, Pad, TableEvent } from '../../../src/emotion/index.ts';
import { formatCard, parseCards } from '../../../src/cards/index.ts';
import type { Card, Rng } from '../../../src/cards/index.ts';
import { equityVsRange } from '../../../src/equity/index.ts';
import type { WeightedHands } from '../../../src/equity/index.ts';
import { liveRange } from '../../../src/persona/range.ts';
import type { GazeTarget } from '../face/avatar.ts';
import type { Ranges } from './blueprint.ts';
import type { Beat, Hand, Scene } from './scenes.ts';

export interface TableView {
  hero: Card[] | null;
  villain: Card[] | null;
  board: Card[];
  potBb: number;
  equity: number | null;
}

export interface RunnerHooks {
  table(view: TableView): void;
  log(label: string, impulses: Impulse[]): void;
  impulses(impulses: Impulse[]): void;
  say(text: string): void;
  player(text: string): void;
  gaze(target: GazeTarget): void;
  effort(effort: number, acted: Pad | null): void;
  head(kind: 'shake' | 'nod' | 'tilt', amp: number, dur: number): void;
  gesture(face: string, amp: number): void;
}

const RANDOM_RANGE: WeightedHands = (() => {
  const hands: Array<{ cards: readonly [Card, Card]; weight: number }> = [];
  for (let a = 0; a < 52; a++) {
    for (let b = a + 1; b < 52; b++) {
      hands.push({ cards: [a, b], weight: 1 });
    }
  }
  return hands;
})();

const pair = (text: string): [Card, Card] => {
  const cards = parseCards(text);
  return [cards[0]!, cards[1]!];
};

export const cardsText = (cards: readonly Card[]): string => cards.map(formatCard).join(' ');

const BOARD_COUNT = { flop: 3, turn: 4, river: 5 } as const;
const STREET_LABEL = { flop: 'Флоп', turn: 'Тёрн', river: 'Ривер' } as const;
const SIGNAL_LABEL: Readonly<Record<ChatSignal, string>> = {
  tease: 'подколка',
  mockBluff: 'насмешка над блефом',
  compliment: 'комплимент',
  friendly: 'дружелюбие',
  claimStrength: 'намёк на силу',
  claimWeakness: 'намёк на слабость',
};

const pct = (x: number): string => `${Math.round(x * 100)}%`;

export const DEFAULT_STACK_BB = 100;
const STREETS_LEFT: Readonly<Record<number, number>> = { 0: 3, 3: 2, 4: 1, 5: 0 };

const cache = new Map<string, number>();

export function boardOf(hand: Hand): Card[] {
  return parseCards(hand.board.join(' '));
}

export interface Runner {
  start(scene: Scene): void;
  update(elapsed: number): void;
  equityAt(hand: number, boardCount: number, revealed: boolean, after?: number): number;
}

export function createRunner(
  engine: Engine,
  hooks: RunnerHooks,
  makeRng: () => Rng,
  ranges?: Ranges,
): Runner {
  let scene: Scene | null = null;
  let next = 0;
  let handIndex = 0;
  let boardCount = 0;
  let revealed = false;
  let potBb = 0;
  let investedBb = 0;
  let equity: number | null = null;
  let narrowAfter = 0;

  const moneyNow = () => {
    const stack = scene?.hands[handIndex]?.stackBb ?? DEFAULT_STACK_BB;
    return {
      potBb,
      investedBb,
      stackBb: Math.max(0, stack - investedBb),
      streetsLeft: STREETS_LEFT[boardCount] ?? 0,
    };
  };

  const rangeOf = (hand: Hand, board: Card[], after: number): WeightedHands => {
    const weights = after > 0 ? ranges?.(hand, after) : null;
    return weights ? liveRange(weights, [...pair(hand.hero), ...board]) : RANDOM_RANGE;
  };

  const equityAt = (h: number, count: number, open: boolean, after = 0): number => {
    const hand = scene?.hands[h];
    if (!hand) {
      return 0.5;
    }
    const key = `${scene?.id}:${h}:${count}:${open}:${after}:${ranges ? 'blueprint' : ''}`;
    const known = cache.get(key);
    if (known !== undefined) {
      return known;
    }
    const board = boardOf(hand).slice(0, count);
    const range: WeightedHands =
      open && hand.villain
        ? [{ cards: pair(hand.villain), weight: 1 }]
        : rangeOf(hand, board, after);
    const value = equityVsRange(pair(hand.hero), range, board, {
      rng: makeRng(),
      samples: open ? 20000 : 4000,
    });
    cache.set(key, value);
    return value;
  };

  const view = (): TableView => {
    const hand = scene?.hands[handIndex];
    return {
      hero: hand ? pair(hand.hero) : null,
      villain: hand && revealed && hand.villain ? pair(hand.villain) : null,
      board: hand ? boardOf(hand).slice(0, boardCount) : [],
      potBb,
      equity,
    };
  };

  const send = (label: string, event: TableEvent): void => {
    const impulses = engine.event(event);
    hooks.log(label, impulses);
    hooks.impulses(impulses);
  };

  const refresh = (): void => {
    equity = equityAt(handIndex, boardCount, revealed, narrowAfter);
  };

  const money = (beat: Extract<Beat, { do: 'deal' | 'pot' }>): void => {
    potBb = beat.potBb ?? potBb;
    investedBb = beat.investedBb ?? investedBb;
  };

  const cardBeat = (beat: Beat): boolean => {
    const hand = scene?.hands[handIndex];
    switch (beat.do) {
      case 'deal':
        handIndex = beat.hand ?? 0;
        boardCount = 0;
        revealed = false;
        narrowAfter = 0;
        money({ ...beat, potBb: beat.potBb ?? 3, investedBb: beat.investedBb ?? 1.5 });
        refresh();
        send(
          `Раздача ${scene?.hands[handIndex]?.hero ?? ''}: эквити против случайной руки ${pct(equity ?? 0)}`,
          {
            kind: 'deal',
            equity: equity ?? 0.5,
            ...moneyNow(),
          },
        );
        return true;
      case 'street':
        boardCount = BOARD_COUNT[beat.street];
        refresh();
        send(
          `${STREET_LABEL[beat.street]} ${cardsText(view().board.slice(beat.street === 'flop' ? 0 : boardCount - 1))}: эквити ${pct(equity ?? 0)}`,
          {
            kind: 'street',
            equity: equity ?? 0.5,
            ...moneyNow(),
          },
        );
        return true;
      case 'reveal':
        revealed = true;
        refresh();
        send(`Соперник вскрывает ${hand?.villain ?? ''}: эквити ${pct(equity ?? 0)}`, {
          kind: 'street',
          equity: equity ?? 0.5,
          ...moneyNow(),
        });
        return true;
      case 'pot':
        money(beat);
        send(`Банк ${potBb} бб, вложено ${investedBb} бб`, {
          kind: 'street',
          equity: equity ?? 0.5,
          ...moneyNow(),
        });
        return true;
      default:
        return false;
    }
  };

  const gameBeat = (beat: Beat): boolean => {
    switch (beat.do) {
      case 'oppBet':
        potBb = beat.potBb;
        send(`Соперник ${beat.raise ? 'рейзит' : 'ставит'} ${beat.sizeBb} бб`, {
          kind: 'opponentBet',
          sizeBb: beat.sizeBb,
          equity: equity ?? 0.5,
          raise: beat.raise,
        });
        return true;
      case 'narrow':
        narrowAfter = beat.after;
        refresh();
        send(`Его диапазон по блупринту после его действия: эквити ${pct(equity ?? 0)}`, {
          kind: 'street',
          equity: equity ?? 0.5,
          ...moneyNow(),
        });
        return true;
      case 'result':
        send(beat.netBb >= 0 ? `Выиграла ${beat.netBb} бб` : `Проиграла ${-beat.netBb} бб`, {
          kind: 'result',
          netBb: beat.netBb,
          lastEquity: beat.lastEquity,
        });
        equity = null;
        return true;
      case 'bluff':
        send(beat.succeeded ? 'Блеф прошёл' : 'Блеф поймали', {
          kind: 'bluff',
          succeeded: beat.succeeded,
          potBb,
        });
        return true;
      case 'mistake':
        send(`Ошибка: сбросила лучшую руку, потеряла ${beat.costBb} бб`, {
          kind: 'mistake',
          costBb: beat.costBb,
        });
        return true;
      case 'player':
        hooks.player(beat.text);
        if (beat.signal) {
          send(`Игрок: «${beat.text}» (${SIGNAL_LABEL[beat.signal]})`, {
            kind: 'chat',
            signal: beat.signal,
          });
        }
        return true;
      default:
        return false;
    }
  };

  const showBeat = (beat: Beat): void => {
    switch (beat.do) {
      case 'say':
        hooks.say(beat.text);
        break;
      case 'gaze':
        hooks.gaze(beat.target);
        break;
      case 'effort':
        hooks.effort(beat.effort, beat.acted ?? null);
        break;
      case 'head':
        hooks.head(beat.kind, beat.amp, beat.dur);
        break;
      case 'gesture':
        hooks.gesture(beat.face, beat.amp);
        break;
      default:
        break;
    }
  };

  const run = (beat: Beat): void => {
    if (!cardBeat(beat) && !gameBeat(beat)) {
      showBeat(beat);
    }
    hooks.table(view());
  };

  return {
    start(s) {
      scene = s;
      next = 0;
      handIndex = 0;
      boardCount = 0;
      revealed = false;
      potBb = 0;
      investedBb = 0;
      equity = null;
      hooks.table(view());
    },
    update(elapsed) {
      const beats = scene?.beats ?? [];
      while (next < beats.length && beats[next]!.at <= elapsed) {
        run(beats[next]!);
        next++;
      }
    },
    equityAt,
  };
}
