import { describe, expect, it } from 'vitest';
import {
  EMPTY_SUMMARY,
  FOUGHT_BETS,
  NOTABLE_POT_BB,
  since,
  withHand,
  withSignals,
} from './summary.ts';
import type { HandSummary } from './summary.ts';

const hand = (patch: Partial<HandSummary> = {}): HandSummary => ({
  handNumber: 1,
  netBb: 0,
  potBb: 2,
  won: false,
  bluffCaught: false,
  bets: 0,
  reraised: false,
  playerBluffShown: false,
  playerAllIn: false,
  ...patch,
});

describe('since', () => {
  it('gives what changed after an earlier summary', () => {
    const first = withSignals(withHand(EMPTY_SUMMARY, hand({ netBb: 4, playerBluffShown: true })), [
      'tease',
      'tease',
    ]);
    const later = withSignals(withHand(first, hand({ netBb: -10, playerAllIn: true })), [
      'tease',
      'compliment',
    ]);
    expect(since(later, first)).toEqual({
      hands: 1,
      netBb: -10,
      playerBluffsShown: 0,
      playerAllIns: 1,
      signals: { tease: 1, compliment: 1 },
      notable: [],
    });
    expect(since(first, EMPTY_SUMMARY)).toEqual(first);
    expect(since(first, first)).toEqual(EMPTY_SUMMARY);
  });
});

describe('notable hands', () => {
  const kinds = (hands: HandSummary[]) =>
    hands.reduce(withHand, EMPTY_SUMMARY).notable.map((n) => [n.kind, n.handNumber]);

  it(`keeps a won pot of ${NOTABLE_POT_BB} bb and more as her big win`, () => {
    expect(kinds([hand({ won: true, potBb: 19 })])).toEqual([]);
    expect(kinds([hand({ won: true, potBb: 25 })])).toEqual([['bigWin', 1]]);
    expect(kinds([hand({ won: false, potBb: 30, handNumber: 2 })])).toEqual([['bigLoss', 2]]);
  });

  it('keeps the biggest win and loss, and the last caught bluff', () => {
    const hands = [
      hand({ handNumber: 1, won: true, potBb: 40 }),
      hand({ handNumber: 2, won: true, potBb: 30 }),
      hand({ handNumber: 3, bluffCaught: true }),
      hand({ handNumber: 4, bluffCaught: true }),
    ];
    expect(kinds(hands)).toEqual([
      ['bigWin', 1],
      ['bluffCaught', 4],
    ]);
  });

  it(`calls a hand of ${FOUGHT_BETS} bets or a reraise the most fought`, () => {
    expect(kinds([hand({ bets: 4 })])).toEqual([['fought', 1]]);
    expect(kinds([hand({ bets: 3, reraised: true })])).toEqual([['fought', 1]]);
    expect(kinds([hand({ bets: 3 })])).toEqual([]);
  });

  it('keeps the hand with more bets as the most fought, then the bigger pot', () => {
    expect(kinds([hand({ handNumber: 1, bets: 6 }), hand({ handNumber: 2, bets: 5 })])).toEqual([
      ['fought', 1],
    ]);
    expect(
      kinds([
        hand({ handNumber: 1, bets: 5, potBb: 10 }),
        hand({ handNumber: 2, bets: 5, potBb: 12 }),
      ]),
    ).toEqual([['fought', 2]]);
  });

  it('tells who won a notable hand and its pot', () => {
    const [win] = withHand(
      EMPTY_SUMMARY,
      hand({ handNumber: 7, won: true, potBb: 52, bets: 4 }),
    ).notable;
    expect(win).toEqual({ kind: 'bigWin', handNumber: 7, potBb: 52, won: true, bets: 4 });
  });
});
