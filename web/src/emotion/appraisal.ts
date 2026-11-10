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
  | ({ kind: 'street'; equity: number; previousEquity?: number } & Money)
  | { kind: 'opponentBet'; sizeBb: number; equity: number; raise?: boolean; pressure?: number }
  | { kind: 'result'; netBb: number; lastEquity?: number }
  | { kind: 'bluff'; succeeded: boolean; potBb: number }
  | { kind: 'mistake'; costBb: number }
  | { kind: 'ownMove'; move: 'bet'; amountBb: number; equity: number }
  | { kind: 'ownMove'; move: 'fold'; facingBb: number; equity: number }
  | { kind: 'chat'; signal: ChatSignal };

export interface AppraisalContext {
  prospect: Prospect | null;
  pressure: number;
  traits: Traits;
}

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
    luck: 1,
    resolved: swing,
    expected: before,
    unexpected: saturate(3 * (swing - 0.15)),
    reason: `equity ${pct(before)} to ${pct(e.equity)}`,
  };
}

function opponentBet(e: Extract<TableEvent, { kind: 'opponentBet' }>, c: AppraisalContext): Axes {
  const open = 4 * e.equity * (1 - e.equity);
  const pressure = Math.min(3, e.pressure ?? c.pressure);
  const challenge = e.raise === true ? 0.12 * (1 + 0.5 * pressure) : 0;
  return {
    ...BLANK,
    realized: false,
    opponent: 1,
    value: -(0.6 * scaled(e.sizeBb) * open + challenge),
    control: leaningOf(c.traits.coping, e.equity),
    reason: `the opponent ${e.raise === true ? 'raises' : 'bets'} ${e.sizeBb} bb, her equity ${pct(e.equity)}`,
  };
}

function result(e: Extract<TableEvent, { kind: 'result' }>, traits: Traits): Axes {
  const expected = e.lastEquity ?? 0.5;
  const lost = e.netBb < 0;
  const luck = lost ? smoothstep(0.5, 0.95, expected) : smoothstep(0.5, 0.9, 1 - expected);
  const mine = lost ? traits.selfBlame : traits.coping;
  return {
    ...BLANK,
    value: lost ? -scaled(e.netBb) : scaled(e.netBb),
    resolved: 1,
    expected,
    luck,
    unexpected: luck,
    self: (1 - luck) * mine,
    opponent: (1 - luck) * (1 - mine),
    reason: `${lost ? 'lost' : 'won'} ${Math.abs(e.netBb)} bb with equity ${pct(expected)}`,
  };
}

function ownMove(e: Extract<TableEvent, { kind: 'ownMove' }>): Axes {
  const { equity } = e;
  if (e.move === 'fold') {
    return {
      ...BLANK,
      opponent: 1,
      resolved: 1,
      expected: equity,
      value: -0.35 * scaled(e.facingBb) * smoothstep(0.35, 0.75, equity),
      reason: `she folds to ${e.facingBb} bb with equity ${pct(equity)}`,
    };
  }
  const label = `she bets ${e.amountBb} bb with equity ${pct(equity)}`;
  if (equity < WEAK_EQUITY) {
    const value = -0.5 * scaled(e.amountBb) * (1 - equity);
    return { ...BLANK, realized: false, self: 1, value, reason: `${label}: at risk` };
  }
  const value = 0.2 * scaled(e.amountBb) * smoothstep(0.7, 0.9, equity);
  return { ...BLANK, self: 1, value, reason: `${label}: she takes the lead` };
}

export const WEAK_EQUITY = 0.45;

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
    case 'bluff': {
      const value = e.succeeded ? 0.8 * scaled(e.potBb) : -scaled(e.potBb);
      const reason = e.succeeded ? 'the bluff got through' : 'the bluff was caught';
      return { ...BLANK, self: 1, value, reason };
    }
    case 'mistake':
      return {
        ...BLANK,
        self: 1,
        value: -scaled(e.costBb),
        reason: `the mistake cost ${e.costBb} bb`,
      };
    case 'ownMove':
      return ownMove(e);
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
