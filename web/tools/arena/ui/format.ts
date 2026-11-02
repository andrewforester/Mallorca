import type { SavedReport } from './types.ts';

export function signed(value: number, digits = 1): string {
  const text = Math.abs(value).toFixed(digits);
  return value < 0 ? `-${text}` : `+${text}`;
}

export function result(report: Pick<SavedReport, 'bbPer100' | 'ci95'>): string {
  const interval = report.ci95 === null ? 'n/a' : report.ci95.toFixed(1);
  return `${signed(report.bbPer100)} ± ${interval}`;
}

export function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function when(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function seconds(ms: number): string {
  return `${Math.round(ms / 1000)} s`;
}

export const LABELS: Record<string, string> = {
  button: 'Button',
  bigBlind: 'Big blind',
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
  'no-showdown': 'No showdown',
};
