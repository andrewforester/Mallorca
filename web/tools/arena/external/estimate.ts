import { allInEvNet } from './allInEv.ts';
import type { ExternalLine } from './log.ts';
import { BLINDS } from './mirror.ts';

export interface Estimate {
  bbPer100: number;
  ci95: number | null;
  sdPerHand: number;
  handsFor10: number | null;
}

export interface ExternalEstimate {
  hands: number;
  abandoned: number;
  handsByPosition: { bigBlind: number; button: number };
  raw: Estimate;
  allInEv: Estimate;
  baseline: Estimate;
}

export function summarizeNets(nets: number[]): Estimate {
  const values = nets.map((net) => (net / BLINDS.big) * 100);
  const n = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  if (n < 2) return { bbPer100: mean, ci95: null, sdPerHand: 0, handsFor10: null };
  const sd = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1));
  return {
    bbPer100: mean,
    ci95: (1.96 * sd) / Math.sqrt(n),
    sdPerHand: sd,
    handsFor10: Math.ceil(((1.96 * sd) / 10) ** 2),
  };
}

export function estimate(lines: ExternalLine[]): ExternalEstimate {
  const played = lines.filter((line) => !line.external.abandoned);
  const winnings = played.map((line) => line.external.winnings ?? 0);
  return {
    hands: played.length,
    abandoned: lines.length - played.length,
    handsByPosition: {
      bigBlind: played.filter((line) => line.external.clientPos === 0).length,
      button: played.filter((line) => line.external.clientPos === 1).length,
    },
    raw: summarizeNets(winnings),
    allInEv: summarizeNets(played.map(allInEvNet)),
    baseline: summarizeNets(
      played.map((line) => (line.external.winnings ?? 0) - (line.external.baselineWinnings ?? 0)),
    ),
  };
}

function figure(e: Estimate): string {
  const sign = e.bbPer100 >= 0 ? '+' : '';
  const ci = e.ci95 === null ? '?' : e.ci95.toFixed(1);
  return `${sign}${e.bbPer100.toFixed(1)} ± ${ci}`;
}

export function formatEstimate(strategy: string, e: ExternalEstimate): string {
  return (
    `${strategy} vs slumbot (200 bb): baseline ${figure(e.baseline)}, ` +
    `all-in EV ${figure(e.allInEv)}, raw ${figure(e.raw)} bb/100 over ${e.hands} hands`
  );
}
