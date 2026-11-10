import { parseCards } from '../../src/cards/index.ts';
import type { Card } from '../../src/cards/index.ts';
import type { BotBias } from '../../src/brains/index.ts';
import type { Action, SeatIndex } from '../../src/engine/index.ts';

export interface ParsedAction {
  seat: SeatIndex;
  street: number;
  action: Action;
  style: BotBias | null;
}

export interface ParsedHand {
  title: string;
  names: [string, string];
  button: SeatIndex;
  stacks: [number, number];
  blinds: { small: number; big: number };
  holes: [Card[] | null, Card[] | null];
  board: Card[];
  actions: ParsedAction[];
}

const AXES = ['aggression', 'bluff', 'tightness', 'sizing', 'stickiness'] as const;

const ACTION = /^(.+?): (folds|checks|calls \d+|bets (\d+)|raises \d+ to (\d+))( and is all-in)?$/;

function emptyHand(title: string): ParsedHand {
  const blinds = /\((\d+)\/(\d+)\)/.exec(title);
  return {
    title,
    names: ['', ''],
    button: 0,
    stacks: [0, 0],
    blinds: { small: Number(blinds?.[1] ?? 0), big: Number(blinds?.[2] ?? 0) },
    holes: [null, null],
    board: [],
    actions: [],
  };
}

function seatOf(hand: ParsedHand, name: string): SeatIndex | null {
  if (hand.names[0] === name) return 0;
  return hand.names[1] === name ? 1 : null;
}

function actionOf(verb: string, bet?: string, to?: string): Action {
  if (verb === 'folds') return { kind: 'fold' };
  if (verb === 'checks') return { kind: 'check' };
  if (verb.startsWith('calls')) return { kind: 'call' };
  return { kind: 'raise', to: Number(bet ?? to) };
}

function styleOf(text: string): BotBias {
  const values = Object.fromEntries(
    AXES.map((axis) => [axis, Number(new RegExp(`${axis} ([\\d.]+)`).exec(text)?.[1] ?? 1)]),
  );
  return values as unknown as BotBias;
}

function readSeat(hand: ParsedHand, line: string): boolean {
  const seat = /^Seat ([12]): (.+) \((\d+) in chips\)$/.exec(line);
  if (seat === null) return false;
  const index = Number(seat[1]) - 1;
  hand.names[index] = seat[2] ?? '';
  hand.stacks[index] = Number(seat[3]);
  return true;
}

function readCards(hand: ParsedHand, line: string): boolean {
  const dealt = /^Dealt to (.+) \[(.+)\]$/.exec(line) ?? /^(.+): shows \[(.+)\]/.exec(line);
  const seat = dealt === null ? null : seatOf(hand, dealt[1] ?? '');
  if (dealt === null || seat === null) return false;
  hand.holes[seat] ??= parseCards(dealt[2] ?? '');
  return true;
}

function readStreet(hand: ParsedHand, line: string, street: { at: number }): boolean {
  if (!/^\*\*\* (FLOP|TURN|RIVER) \*\*\*/.test(line)) return false;
  const dealt = [...line.matchAll(/\[([^\]]+)\]/g)].at(-1)?.[1] ?? '';
  hand.board.push(...parseCards(dealt));
  street.at += 1;
  return true;
}

function readAction(hand: ParsedHand, line: string, street: number): boolean {
  const acted = ACTION.exec(line);
  const seat = acted === null ? null : seatOf(hand, acted[1] ?? '');
  if (acted === null || seat === null) return false;
  hand.actions.push({
    seat,
    street,
    action: actionOf(acted[2] ?? '', acted[3], acted[4]),
    style: null,
  });
  return true;
}

function readStyle(hand: ParsedHand, line: string): void {
  const last = hand.actions.at(-1);
  if (/^\s*~ style:/.test(line) && last !== undefined) last.style = styleOf(line);
}

function parseHand(lines: string[]): ParsedHand {
  const hand = emptyHand(lines[0] ?? '');
  const button = /Seat #([12]) is the button/.exec(lines[1] ?? '');
  hand.button = button?.[1] === '2' ? 1 : 0;
  const street = { at: 0 };
  for (const line of lines.slice(2)) {
    if (line.startsWith('*** SUMMARY ***')) break;
    if (readSeat(hand, line) || readCards(hand, line) || readStreet(hand, line, street)) continue;
    if (!readAction(hand, line, street.at)) readStyle(hand, line);
  }
  return hand;
}

export function parseHands(text: string): ParsedHand[] {
  const blocks: string[][] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('PokerStars Hand #')) blocks.push([]);
    blocks.at(-1)?.push(line);
  }
  return blocks.map(parseHand);
}
