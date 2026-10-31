import type { HandCategory, LogEntry, SeatIndex } from '../game/index.ts';
import { t } from './i18n.ts';

export function handName(category: HandCategory): string {
  return t(`hands.${category}`);
}

export function actionTag(tag: LogEntry): string {
  return t(`actions.${tag.key}`, tag.params);
}

export function logLine(entry: LogEntry, names: [string, string], humanSeat: SeatIndex): string {
  const { seat, category, ...rest } = entry.params;
  const params: Record<string, string | number> =
    category === undefined ? rest : { ...rest, hand: handName(category as HandCategory) };
  if (seat === undefined) {
    return t(`log.${entry.key}`, params);
  }
  const person = seat === humanSeat ? 'you' : 'other';
  return t(`log.${person}.${entry.key}`, { ...params, name: names[seat as SeatIndex] });
}

export type ActionKind = 'passive' | 'aggressive' | 'fold';

const KINDS: Record<string, ActionKind> = {
  check: 'passive',
  call: 'passive',
  bet: 'aggressive',
  raiseTo: 'aggressive',
  allIn: 'aggressive',
  fold: 'fold',
};

export function actionKind(entry: LogEntry): ActionKind {
  return KINDS[entry.key] ?? 'passive';
}

export function logKind(entry: LogEntry): 'aggressive' | 'plain' {
  return entry.key === 'raise' || entry.key === 'bet' || entry.key === 'allIn'
    ? 'aggressive'
    : 'plain';
}
