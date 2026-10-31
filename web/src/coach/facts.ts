import { mulberry32 } from '../cards/index.ts';
import type { Card } from '../cards/index.ts';
import type { Observation } from '../brains/index.ts';
import type { LegalActions } from '../engine/index.ts';
import type { CfrBot, CfrModel, CfrSpot } from '../cfr/index.ts';
import { equityVsRange } from './equity.ts';
import { PAIRS, cellOf, foldGrid, isLive, pairIndex } from './grid.ts';
import { coachMove } from './moves.ts';
import type { CoachMove } from './moves.ts';
import { spotOdds } from './odds.ts';
import type { SpotOdds } from './odds.ts';

export interface CoachRequest {
  model: CfrModel;
  observations: Observation[];
  legal: LegalActions;
  pot: number;
  range: ArrayLike<number> | null;
}

export interface Hint {
  moves: CoachMove[];
  mine: number[];
  approximate: boolean;
  heroCell: number;
}

export interface CoachFacts {
  hint: Hint | null;
  strategy: (number[] | null)[] | null;
  range: (number | null)[] | null;
  combos: number | null;
  equity: number;
  versus: 'range' | 'random';
  odds: SpotOdds | null;
}

interface Seen {
  hero: [Card, Card];
  board: Card[];
}

function replay(bot: CfrBot, observations: Observation[]): Seen {
  const seen: Seen = { hero: [0, 0], board: [] };
  let rng = mulberry32(0);
  for (const o of observations) {
    switch (o.type) {
      case 'handStarted':
        rng = mulberry32(o.handNumber);
        bot.handStarted(o);
        break;
      case 'holeCards':
        seen.hero = o.cards;
        bot.holeCards(o.cards);
        break;
      case 'acted':
        bot.acted(o.who === 'hero', o.action, rng.next());
        break;
      case 'street':
        seen.board = o.board;
        bot.street(o.board);
        break;
    }
  }
  return seen;
}

function hintOf(spot: CfrSpot, seen: Seen, request: CoachRequest): Hint {
  const n = spot.moves.length;
  const row = pairIndex(seen.hero[0], seen.hero[1]);
  return {
    moves: spot.moves.map((m) => coachMove(m, request.legal, request.pot)),
    mine: Array.from(spot.grid.subarray(row * n, (row + 1) * n)),
    approximate: spot.approximate,
    heroCell: cellOf(seen.hero[0], seen.hero[1]),
  };
}

function liveRange(range: ArrayLike<number> | null, dead: Card[]): Float32Array | null {
  if (range === null) {
    return null;
  }
  const out = new Float32Array(PAIRS);
  for (let i = 0; i < PAIRS; i++) {
    out[i] = isLive(i, dead) ? (range[i] ?? 0) : 0;
  }
  return out;
}

export function coachFacts(request: CoachRequest): CoachFacts {
  const bot = request.model.newBot();
  try {
    const seen = replay(bot, request.observations);
    const spot = bot.spot(request.legal);
    const dead = [...seen.hero, ...seen.board];
    const range = liveRange(request.range, dead);
    return {
      hint: spot === null ? null : hintOf(spot, seen, request),
      strategy: spot === null ? null : foldGrid(spot.grid, spot.moves.length, seen.board),
      range: range === null ? null : foldGrid(range, 1, dead).map((cell) => cell?.[0] ?? null),
      combos: range === null ? null : range.reduce((a, b) => a + b, 0),
      equity: equityVsRange(seen.hero, seen.board, range),
      versus: range === null ? 'random' : 'range',
      odds: spotOdds(request.legal.call ?? 0, request.pot),
    };
  } finally {
    bot.free();
  }
}
