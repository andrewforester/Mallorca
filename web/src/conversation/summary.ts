import type { Signal } from '../persona/index.ts';

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

export function since(current: SessionSummary, earlier: SessionSummary): SessionSummary {
  const signals: SessionSummary['signals'] = {};
  for (const [signal, count] of Object.entries(current.signals) as [Signal, number][]) {
    const delta = count - (earlier.signals[signal] ?? 0);
    if (delta > 0) {
      signals[signal] = delta;
    }
  }
  return {
    hands: current.hands - earlier.hands,
    netBb: current.netBb - earlier.netBb,
    playerBluffsShown: current.playerBluffsShown - earlier.playerBluffsShown,
    playerAllIns: current.playerAllIns - earlier.playerAllIns,
    signals,
  };
}
