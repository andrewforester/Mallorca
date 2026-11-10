import type { BotBias } from '../../src/brains/index.ts';

export type MoveClass = 'fold' | 'passive' | 'raise' | 'allIn';

export type Axis = keyof BotBias;

export const AXES: Axis[] = ['aggression', 'bluff', 'tightness', 'sizing', 'stickiness'];

export interface Shares {
  classes: MoveClass[];
  street: number;
  base: number[];
  styled: number[];
  only: Record<Axis, number[]>;
  foldAxes: number[];
  played: number | null;
}

export interface Flag {
  level: 'error' | 'note';
  rule: string;
  text: string;
}

const EPS = 0.005;
const UNLIKELY = 0.05;
const LARGE = 0.25;

const pct = (v: number): string => `${(100 * v).toFixed(1)}%`;

function share(row: number[], classes: MoveClass[], kinds: MoveClass[]): number {
  return row.reduce((sum, v, i) => (kinds.includes(classes[i] ?? 'fold') ? sum + v : sum), 0);
}

function foldRules(s: Shares, style: BotBias): Flag[] {
  const flags: Flag[] = [];
  const axis: Axis = s.street === 0 ? 'tightness' : 'stickiness';
  const value = style[axis];
  const fold = (row: number[]) => share(row, s.classes, ['fold']);
  const moved = fold(s.only[axis]) - fold(s.base);
  const loose = axis === 'tightness' ? value < 1 : value > 1;
  if ((loose && moved > EPS) || (value !== 1 && !loose && moved < -EPS)) {
    const text = `${axis} ${value} moved the fold from ${pct(fold(s.base))} to ${pct(fold(s.only[axis]))}`;
    flags.push({ level: 'error', rule: 'fold-direction', text });
  }
  if (Math.abs(fold(s.styled) - fold(s.foldAxes)) > EPS) {
    const text = `the fold is ${pct(fold(s.styled))} with the whole style but ${pct(fold(s.foldAxes))} with the fold axes alone`;
    flags.push({ level: 'error', rule: 'fold-kept', text });
  }
  const bluffed = s.only.bluff.some((v, i) => Math.abs(v - (s.base[i] ?? 0)) > EPS);
  if (bluffed) {
    flags.push({
      level: 'error',
      rule: 'bluff-facing',
      text: 'bluff changed a decision facing a bet',
    });
  }
  return flags;
}

function checkRules(s: Shares, style: BotBias): Flag[] {
  const bets = (row: number[]) => share(row, s.classes, ['raise', 'allIn']);
  const moved = bets(s.only.aggression) - bets(s.base);
  const value = style.aggression;
  if ((value < 1 && moved > EPS) || (value > 1 && moved < -EPS)) {
    const text = `aggression ${value} moved the bets from ${pct(bets(s.base))} to ${pct(bets(s.only.aggression))}`;
    return [{ level: 'error', rule: 'aggression-direction', text }];
  }
  return [];
}

function sizingRules(s: Shares): Flag[] {
  const kinds: MoveClass[][] = [['fold'], ['passive'], ['raise'], ['allIn']];
  const changed = kinds.some(
    (k) => Math.abs(share(s.only.sizing, s.classes, k) - share(s.base, s.classes, k)) > EPS,
  );
  if (!changed) return [];
  return [
    {
      level: 'error',
      rule: 'sizing-total',
      text: 'sizing changed more than the split between sizes',
    },
  ];
}

function notes(s: Shares): Flag[] {
  const flags: Flag[] = [];
  const chosen = s.played === null ? null : s.styled[s.played];
  if (chosen !== null && chosen !== undefined && chosen < UNLIKELY) {
    flags.push({
      level: 'note',
      rule: 'unlikely-choice',
      text: `the move she made had ${pct(chosen)} with her style`,
    });
  }
  const largest = s.styled.reduce((m, v, i) => Math.max(m, Math.abs(v - (s.base[i] ?? 0))), 0);
  if (largest >= LARGE) {
    const driver = AXES.map((axis) => {
      const gap = s.only[axis].reduce((m, v, i) => Math.max(m, Math.abs(v - (s.base[i] ?? 0))), 0);
      return { axis, gap };
    }).sort((a, b) => b.gap - a.gap)[0];
    const text = `a move changed by ${pct(largest)}, most of it from ${driver?.axis ?? 'none'}`;
    flags.push({ level: 'note', rule: 'large-move', text });
  }
  return flags;
}

export function checkDecision(s: Shares, style: BotBias): Flag[] {
  const facing = s.classes.includes('fold');
  return [...(facing ? foldRules(s, style) : checkRules(s, style)), ...sizingRules(s), ...notes(s)];
}
