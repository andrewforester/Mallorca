import { fullDeck } from '../../src/cards/index.ts';
import type { Card } from '../../src/cards/index.ts';
import type { BotBias } from '../../src/brains/index.ts';
import type { CfrModel } from '../../src/cfr/index.ts';
import { checkOrCall, playToEnd, startHandWith } from '../../src/engine/index.ts';
import type { Action, LegalActions, SeatIndex, Step } from '../../src/engine/index.ts';
import type { ParsedHand } from './parse.ts';

export type MoveClass = 'fold' | 'passive' | 'raise' | 'allIn';

export type Axis = keyof BotBias;

export const AXES: Axis[] = ['aggression', 'bluff', 'tightness', 'sizing', 'stickiness'];

export const NEUTRAL: BotBias = { aggression: 1, bluff: 1, tightness: 1, sizing: 1, stickiness: 1 };

const STREET_CARDS = [0, 3, 4, 5];

export interface Spot {
  legal: LegalActions;
  pot: number;
}

export interface Decision {
  classes: MoveClass[];
  street: number;
  base: number[];
  styled: number[];
  only: Record<Axis, number[]>;
  played: number | null;
  hand: ParsedHand;
  index: number;
  her: SeatIndex;
  hole: Card[];
  board: Card[];
  spot: Spot;
  style: BotBias;
  moves: Action[];
}

const other = (seat: SeatIndex): SeatIndex => (seat === 0 ? 1 : 0);

function deckOf(hand: ParsedHand): Card[] {
  const known = [...(hand.holes[0] ?? []), ...(hand.holes[1] ?? []), ...hand.board];
  const rest = fullDeck().filter((c) => !known.includes(c));
  const take = (cards: Card[] | null): Card[] => cards ?? rest.splice(0, 2);
  const button = take(hand.holes[hand.button]);
  const blind = take(hand.holes[other(hand.button)]);
  const head = [blind[0], button[0], blind[1], button[1], ...hand.board] as Card[];
  return [...head, ...rest.filter((c) => !head.includes(c))];
}

function spotsOf(hand: ParsedHand): Spot[] {
  const seats = hand.names.map((name, i) => ({
    name,
    stack: hand.stacks[i] ?? 0,
  })) as Step['seats'];
  const deal = { button: hand.button, blinds: hand.blinds, handNumber: 1 };
  let current = startHandWith(seats, deal, deckOf(hand));
  const spots: Spot[] = [];
  playToEnd(
    current,
    (_seat, legal) => {
      const { pot, bets } = current.hand;
      spots.push({ legal, pot: pot + bets[0] + bets[1] });
      return hand.actions[spots.length - 1]?.action ?? checkOrCall(legal);
    },
    (step) => {
      current = step;
    },
  );
  return spots;
}

function classOf(move: Action, legal: LegalActions): MoveClass {
  if (move.kind === 'fold') return 'fold';
  if (move.kind !== 'raise') return 'passive';
  return move.to >= (legal.raise?.max ?? Infinity) ? 'allIn' : 'raise';
}

const family = (a: Action): string =>
  a.kind === 'check' || a.kind === 'call' ? 'passive' : a.kind;

function playedIndex(moves: Action[], played: Action): number | null {
  const gap = (m: Action) =>
    m.kind === 'raise' && played.kind === 'raise' ? Math.abs(m.to - played.to) : 0;
  let best: number | null = null;
  moves.forEach((move, i) => {
    if (family(move) !== family(played)) return;
    const current = best === null ? undefined : moves[best];
    if (current === undefined || gap(move) < gap(current)) best = i;
  });
  return best;
}

interface Run {
  moves: Action[];
  base: number[];
  biased: number[];
}

interface At {
  hand: ParsedHand;
  index: number;
  legal: LegalActions;
}

function run(model: CfrModel, at: At, bias: BotBias): Run | null {
  const { hand, index, legal } = at;
  const her = hand.actions[index]?.seat ?? 0;
  const bot = model.newBot();
  bot.setBias(bias);
  bot.handStarted({
    heroOnButton: her === hand.button,
    heroStack: hand.stacks[her],
    villainStack: hand.stacks[other(her)],
    smallBlind: hand.blinds.small,
    bigBlind: hand.blinds.big,
  });
  bot.holeCards(hand.holes[her] as [Card, Card]);
  let street = 0;
  const reach = (target: number) => {
    for (; street < target; street += 1) bot.street(hand.board.slice(0, STREET_CARDS[street + 1]));
  };
  hand.actions.slice(0, index).forEach((a) => {
    reach(a.street);
    bot.acted(a.seat === her, a.action, 0.5);
  });
  reach(hand.actions[index]?.street ?? 0);
  bot.decide(legal, 0.5);
  const breakdown = bot.explain();
  bot.free();
  return breakdown === null
    ? null
    : { moves: breakdown.moves, base: breakdown.base, biased: breakdown.biased };
}

function alone(style: BotBias, axes: Axis[]): BotBias {
  const bias = { ...NEUTRAL };
  for (const axis of axes) bias[axis] = style[axis];
  return bias;
}

export interface Given {
  style?: BotBias;
  her?: SeatIndex;
}

export function decisionsOf(model: CfrModel, hand: ParsedHand, given: Given = {}): Decision[] {
  const spots = spotsOf(hand);
  const decisions: Decision[] = [];
  hand.actions.forEach((action, index) => {
    if (given.her !== undefined && action.seat !== given.her) return;
    const used = action.style ?? given.style;
    const spot = spots[index];
    if (used === undefined || spot === undefined || hand.holes[action.seat] === null) return;
    const at = { hand, index, legal: spot.legal };
    const styled = run(model, at, used);
    if (styled === null) return;
    const biasedOf = (bias: BotBias) => run(model, at, bias)?.biased ?? styled.base;
    const only = Object.fromEntries(
      AXES.map((axis) => [axis, biasedOf(alone(used, [axis]))]),
    ) as Record<Axis, number[]>;
    const shares = {
      classes: styled.moves.map((m) => classOf(m, spot.legal)),
      street: action.street,
      base: styled.base,
      styled: styled.biased,
      only,
      played: playedIndex(styled.moves, action.action),
    };
    decisions.push({
      ...shares,
      hand,
      index,
      her: action.seat,
      hole: hand.holes[action.seat] ?? [],
      board: hand.board.slice(0, STREET_CARDS[action.street]),
      spot,
      style: used,
      moves: styled.moves,
    });
  });
  return decisions;
}
