import type { Signal } from './mood.ts';

export interface SessionSummary {
  hands: number;
  netBb: number;
  playerBluffsShown: number;
  playerAllIns: number;
  signals: Partial<Record<Signal, number>>;
}

export interface HandSummary {
  netBb: number;
  playerBluffShown: boolean;
  playerAllIn: boolean;
}

export const EMPTY_SUMMARY: SessionSummary = {
  hands: 0,
  netBb: 0,
  playerBluffsShown: 0,
  playerAllIns: 0,
  signals: {},
};

export function withHand(summary: SessionSummary, hand: HandSummary): SessionSummary {
  return {
    ...summary,
    hands: summary.hands + 1,
    netBb: summary.netBb + hand.netBb,
    playerBluffsShown: summary.playerBluffsShown + (hand.playerBluffShown ? 1 : 0),
    playerAllIns: summary.playerAllIns + (hand.playerAllIn ? 1 : 0),
  };
}

export function withSignals(summary: SessionSummary, signals: readonly Signal[]): SessionSummary {
  const counts = { ...summary.signals };
  for (const signal of signals) {
    counts[signal] = (counts[signal] ?? 0) + 1;
  }
  return { ...summary, signals: counts };
}
