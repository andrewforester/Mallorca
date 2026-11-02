import type { Signal } from '../persona/index.ts';

export const NOTABLE_POT_BB = 20;
export const FOUGHT_BETS = 4;

export type NotableKind = 'bigWin' | 'bigLoss' | 'bluffCaught' | 'fought';

export interface Notable {
  kind: NotableKind;
  handNumber: number;
  potBb: number;
  won: boolean;
  bets: number;
}

export interface SessionSummary {
  hands: number;
  netBb: number;
  playerBluffsShown: number;
  playerAllIns: number;
  signals: Partial<Record<Signal, number>>;
  notable: Notable[];
}

export interface HandSummary {
  handNumber: number;
  netBb: number;
  potBb: number;
  won: boolean;
  bluffCaught: boolean;
  bets: number;
  reraised: boolean;
  playerBluffShown: boolean;
  playerAllIn: boolean;
}

export const EMPTY_SUMMARY: SessionSummary = {
  hands: 0,
  netBb: 0,
  playerBluffsShown: 0,
  playerAllIns: 0,
  signals: {},
  notable: [],
};

const KINDS: readonly NotableKind[] = ['bigWin', 'bigLoss', 'bluffCaught', 'fought'];

function kindsOf(hand: HandSummary): NotableKind[] {
  const big = hand.potBb >= NOTABLE_POT_BB;
  const fought = hand.bets >= FOUGHT_BETS || hand.reraised;
  return KINDS.filter(
    (k) =>
      (k === 'bigWin' && big && hand.won) ||
      (k === 'bigLoss' && big && !hand.won) ||
      (k === 'bluffCaught' && hand.bluffCaught) ||
      (k === 'fought' && fought),
  );
}

function beats(fresh: Notable, kept: Notable | undefined): boolean {
  if (kept === undefined || fresh.kind === 'bluffCaught') {
    return true;
  }
  if (fresh.kind === 'fought' && fresh.bets !== kept.bets) {
    return fresh.bets > kept.bets;
  }
  return fresh.potBb > kept.potBb;
}

function notableWith(notable: readonly Notable[], hand: HandSummary): Notable[] {
  const kept = new Map(notable.map((n) => [n.kind, n]));
  for (const kind of kindsOf(hand)) {
    const { handNumber, potBb, won, bets } = hand;
    const fresh: Notable = { kind, handNumber, potBb, won, bets };
    if (beats(fresh, kept.get(kind))) {
      kept.set(kind, fresh);
    }
  }
  return KINDS.flatMap((k) => kept.get(k) ?? []);
}

export function withHand(summary: SessionSummary, hand: HandSummary): SessionSummary {
  return {
    ...summary,
    hands: summary.hands + 1,
    netBb: summary.netBb + hand.netBb,
    playerBluffsShown: summary.playerBluffsShown + (hand.playerBluffShown ? 1 : 0),
    playerAllIns: summary.playerAllIns + (hand.playerAllIn ? 1 : 0),
    notable: notableWith(summary.notable, hand),
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
    notable: current.notable,
  };
}
