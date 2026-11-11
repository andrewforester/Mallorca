import { saturate, smoothstep } from './emotions.ts';
import type { Emotions } from './emotions.ts';
import { impulsesOf } from './feelings.ts';
import type { Appraisal, Impulse } from './feelings.ts';
import type { Traits } from './personality.ts';
import { STAKE_BB, atStakeOf, leaningOf } from './tension.ts';
import type { Money, Prospect } from './tension.ts';

export { STAKE_BB } from './tension.ts';
export type { Money, Prospect } from './tension.ts';
export type { Appraisal, Impulse } from './feelings.ts';

export type ChatSignal =
  'tease' | 'compliment' | 'claimStrength' | 'claimWeakness' | 'mockBluff' | 'friendly';

export type TableEvent =
  | ({ kind: 'deal'; equity: number } & Money)
  | ({ kind: 'street'; equity: number; previousEquity?: number; cause?: Cause } & Money)
  | { kind: 'opponentBet'; sizeBb: number; equity: number; raise?: boolean; pressure?: number }
  | { kind: 'opponentCall' }
  | {
      kind: 'result';
      netBb: number;
      decided: Decided;
      lastEquity?: number;
      aggressor?: Aggressor;
    }
  | { kind: 'ownMove'; move: 'bet'; amountBb: number; potBb: number; equity: number }
  | { kind: 'chat'; signal: ChatSignal };

export type Cause = 'cards' | 'opponent';

export type Aggressor = 'her' | 'him';

export type Decided = 'showdown' | 'heFolded' | 'sheFolded';

export interface AppraisalContext {
  prospect: Prospect | null;
  pressure: number;
  traits: Traits;
}

export const PRESSURE_SCALE = 3;

export const scaled = (bb: number): number => saturate(Math.abs(bb) / STAKE_BB);

const pct = (x: number): string => `${Math.round(x * 100)}%`;

const BLANK = {
  realized: true,
  resolved: 0,
  self: 0,
  opponent: 0,
  luck: 0,
  expected: 0,
  unexpected: 0,
};

type Axes = Omit<Appraisal, 'control'> & { control?: number };

function deal(e: Extract<TableEvent, { kind: 'deal' }>): Axes {
  const value = 0.6 * smoothstep(0.6, 0.85, e.equity);
  return { ...BLANK, value, luck: 1, reason: `a starting hand, equity ${pct(e.equity)}` };
}

function street(e: Extract<TableEvent, { kind: 'street' }>): Axes | null {
  const before = e.previousEquity;
  if (before === undefined) {
    return null;
  }
  const delta = e.equity - before;
  const swing = Math.abs(delta);
  return {
    ...BLANK,
    value: delta * (0.3 + 0.7 * scaled(atStakeOf(e))),
    ...(e.cause === 'opponent' ? { opponent: 1 } : { luck: 1 }),
    resolved: swing,
    expected: before,
    unexpected: saturate(3 * (swing - 0.15)),
    reason: `equity ${pct(before)} to ${pct(e.equity)}`,
  };
}

function opponentBet(e: Extract<TableEvent, { kind: 'opponentBet' }>, c: AppraisalContext): Axes {
  const open = 4 * e.equity * (1 - e.equity);
  const pressure = saturate((e.pressure ?? c.pressure) / PRESSURE_SCALE);
  const challenge = e.raise === true ? 0.5 * (1 + pressure) : 0;
  return {
    ...BLANK,
    realized: false,
    opponent: 1,
    value: -0.6 * scaled(e.sizeBb) * open * (1 + challenge),
    control: leaningOf(c.traits.coping, e.equity),
    reason: `the opponent ${e.raise === true ? 'raises' : 'bets'} ${e.sizeBb} bb, her equity ${pct(e.equity)}`,
  };
}

const DRIVE = Math.log(3);
const logit = (p: number): number => Math.log(p / (1 - p));
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export function shareOf(stance: number, aggressor?: Aggressor): number {
  const drive = aggressor === undefined ? 0 : aggressor === 'her' ? DRIVE : -DRIVE;
  return sigmoid(logit(Math.min(0.99, Math.max(0.01, stance))) + drive);
}

function heFolded(netBb: number, traits: Traits): Axes {
  const mine = shareOf(traits.coping, 'her');
  return {
    ...BLANK,
    value: scaled(netBb),
    resolved: 1,
    self: mine,
    opponent: 1 - mine,
    reason: `he folded to her, she won ${Math.abs(netBb)} bb`,
  };
}

function sheFolded(netBb: number, belief: number): Axes {
  return {
    ...BLANK,
    opponent: 1,
    resolved: 1,
    expected: belief,
    value: -0.35 * scaled(netBb) * smoothstep(0.35, 0.75, belief),
    reason: `she folded, ${Math.abs(netBb)} bb gone, belief ${pct(belief)}`,
  };
}

function showdown(e: Extract<TableEvent, { kind: 'result' }>, traits: Traits): Axes {
  const { netBb } = e;
  const expected = e.lastEquity ?? 0.5;
  const lost = netBb < 0;
  const luck = lost ? smoothstep(0.5, 0.95, expected) : smoothstep(0.5, 0.9, 1 - expected);
  const mine = shareOf(lost ? traits.selfBlame : traits.coping, e.aggressor);
  return {
    ...BLANK,
    value: lost ? -scaled(netBb) : scaled(netBb),
    resolved: 1,
    expected,
    luck,
    unexpected: luck,
    self: (1 - luck) * mine,
    opponent: (1 - luck) * (1 - mine),
    reason: `${lost ? 'lost' : 'won'} ${Math.abs(netBb)} bb at showdown, equity ${pct(expected)}`,
  };
}

function result(e: Extract<TableEvent, { kind: 'result' }>, traits: Traits): Axes {
  const expected = e.lastEquity ?? 0.5;
  if (e.decided === 'heFolded') {
    return heFolded(e.netBb, traits);
  }
  return e.decided === 'sheFolded' ? sheFolded(e.netBb, expected) : showdown(e, traits);
}

const CHAT: Readonly<Record<ChatSignal, readonly [number, boolean]>> = {
  tease: [-0.25, true],
  mockBluff: [-0.35, true],
  compliment: [0.25, true],
  friendly: [0.1, true],
  claimStrength: [-0.12, false],
  claimWeakness: [0.1, false],
};

function chat(signal: ChatSignal): Axes {
  const [value, realized] = CHAT[signal];
  return { ...BLANK, value, realized, opponent: 1, reason: `chat: ${signal}` };
}

function axesOf(e: TableEvent, c: AppraisalContext): Axes | null {
  switch (e.kind) {
    case 'deal':
      return deal(e);
    case 'street':
      return street(e);
    case 'opponentBet':
      return opponentBet(e, c);
    case 'result':
      return result(e, c.traits);
    case 'ownMove':
    case 'opponentCall':
      return null;
    case 'chat':
      return chat(e.signal);
  }
}

export function appraisalOf(e: TableEvent, c: AppraisalContext): Appraisal | null {
  const axes = axesOf(e, c);
  return axes === null ? null : { ...axes, control: axes.control ?? c.traits.coping };
}

export function appraise(e: TableEvent, now: Emotions, c: AppraisalContext): Impulse[] {
  const a = appraisalOf(e, c);
  return a === null ? [] : impulsesOf(a, now, c.traits);
}
