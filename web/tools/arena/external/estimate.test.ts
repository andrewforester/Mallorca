import { describe, expect, it } from 'vitest';
import { estimate, formatEstimate, summarizeNets } from './estimate.ts';
import type { ExternalLine } from './log.ts';

function line(
  clientPos: 0 | 1,
  winnings: number,
  baseline: number,
  abandoned = false,
): ExternalLine {
  return {
    record: null,
    external: {
      opponent: 'slumbot',
      clientPos,
      action: 'f',
      holeCards: ['Ah', 'Kd'],
      board: [],
      opponentCards: ['2c', '3d'],
      winnings: abandoned ? null : winnings,
      baselineWinnings: abandoned ? null : baseline,
      seed: 1,
      handIndex: 0,
      abandoned,
      error: null,
    },
  };
}

describe('summarizeNets', () => {
  it('turns chip nets at blinds 50/100 into bb/100', () => {
    const s = summarizeNets([100, -100, 300, -100]);
    expect(s.bbPer100).toBe(50);
    expect(s.sdPerHand).toBeCloseTo(
      Math.sqrt(((50 ** 2 + 150 ** 2 + 250 ** 2 + 150 ** 2) / 3) * 1),
      9,
    );
    expect(s.ci95).toBeCloseTo((1.96 * s.sdPerHand) / 2, 9);
    expect(s.handsFor10).toBe(Math.ceil(((1.96 * s.sdPerHand) / 10) ** 2));
  });

  it('has nothing to say about no hands', () => {
    expect(summarizeNets([])).toEqual({ bbPer100: 0, ci95: null, sdPerHand: 0, handsFor10: null });
  });

  it('has no interval below two hands', () => {
    expect(summarizeNets([100]).ci95).toBeNull();
  });
});

describe('estimate', () => {
  const lines = [
    line(0, 100, 50),
    line(1, -100, -300),
    line(0, 300, 100),
    line(1, -100, 0),
    line(0, 0, 0, true),
  ];

  it('reports raw, all-in EV and baseline figures, and skips abandoned hands', () => {
    const e = estimate(lines);
    expect(e.hands).toBe(4);
    expect(e.abandoned).toBe(1);
    expect(e.handsByPosition).toEqual({ bigBlind: 2, button: 2 });
    expect(e.raw.bbPer100).toBe(50);
    expect(e.allInEv.bbPer100).toBe(50);
    expect(e.baseline.bbPer100).toBe((50 + 200 + 200 - 100) / 4);
  });

  it('reports the mean baseline that the baseline figure relies on', () => {
    expect(estimate(lines).baselineMean).toEqual(summarizeNets([50, -300, 100, 0]));
  });

  it('is a pure function of the log', () => {
    expect(estimate(lines)).toEqual(estimate(structuredClone(lines)));
  });

  it('prints one line', () => {
    expect(formatEstimate('cfr-v2-10', estimate(lines))).toMatch(
      /^cfr-v2-10 vs slumbot \(200 bb\): baseline \+87\.5 ± [\d.]+, all-in EV \+50\.0 ± [\d.]+, raw \+50\.0 ± [\d.]+ bb\/100 over 4 hands$/,
    );
  });
});
