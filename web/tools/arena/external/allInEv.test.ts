import { describe, expect, it } from 'vitest';
import { allInEvNet, exactEquity } from './allInEv.ts';
import type { ExternalLine } from './log.ts';
import { mirrorHand } from './mirror.ts';
import { handRecord } from '../../../src/game/records/record.ts';
import { parseActions } from './slumbot/actions.ts';

function line(
  action: string,
  holeCards: [string, string],
  opponentCards: [string, string],
  board: string[],
): ExternalLine {
  const { step, events } = mirrorHand({
    clientIsBigBlind: true,
    holeCards,
    board,
    opponentCards,
    actions: parseActions(action),
    handNumber: 1,
  });
  const record = handRecord(events, [], {
    sessionId: 's',
    mode: { kind: 'cash', bigBlind: 100, buyIn: 20000 },
    names: ['cfr', 'slumbot'],
    humanSeat: null,
    bot: { id: 'x', version: '1' },
    playedAt: '2026-10-31T00:00:00.000Z',
  });
  return {
    record,
    external: {
      opponent: 'slumbot',
      clientPos: 0,
      action,
      holeCards,
      board,
      opponentCards,
      winnings: step.seats[0].stack - 20000,
      baselineWinnings: 0,
      seed: 1,
      handIndex: 0,
      abandoned: false,
      error: null,
    },
  };
}

describe('exactEquity', () => {
  it('counts the two outs of a set draw on the turn', () => {
    expect(exactEquity(['Ah', 'Ad'], ['Kc', 'Ks'], ['2c', '7d', '9h', 'Js'])).toBeCloseTo(
      42 / 44,
      12,
    );
  });

  it('splits a board that plays', () => {
    expect(exactEquity(['2h', '3d'], ['2c', '3s'], ['Ah', 'Kd', 'Qc', 'Js', 'Th'])).toBe(0.5);
  });

  it('gives aces 81.26% against kings without a shared suit preflop', () => {
    expect(exactEquity(['Ah', 'Ad'], ['Kc', 'Ks'], [])).toBeCloseTo(0.81255, 5);
  });
});

describe('allInEvNet', () => {
  it('replaces the result of a turn all-in by its expectation', () => {
    const l = line(
      'b200c/kk/kb19800c/',
      ['Ah', 'Ad'],
      ['Kc', 'Ks'],
      ['2c', '7d', '9h', 'Js', 'Kd'],
    );
    expect(l.external.winnings).toBe(-20000);
    expect(allInEvNet(l)).toBeCloseTo((42 / 44) * 40000 - 20000, 6);
  });

  it('keeps the real result without an all-in', () => {
    const l = line(
      'b200c/kk/kb200c/kb400c',
      ['Td', '4s'],
      ['Ac', '3s'],
      ['Ah', '8d', '2s', 'Qd', '9s'],
    );
    expect(allInEvNet(l)).toBe(-800);
  });

  it('keeps the real result of a river all-in', () => {
    const l = line(
      'b200c/kk/kk/kb19800c',
      ['Ah', 'Ad'],
      ['Kc', 'Ks'],
      ['2c', '7d', '9h', 'Js', 'Kd'],
    );
    expect(allInEvNet(l)).toBe(-20000);
  });

  it('keeps the real result of a fold to an all-in', () => {
    const l = line('b20000f', ['7h', '2d'], ['Kc', 'Ks'], []);
    expect(allInEvNet(l)).toBe(-100);
  });
});
