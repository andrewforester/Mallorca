import { describe, expect, it } from 'vitest';
import type { Decision } from '../../brains/index.ts';
import {
  call,
  check,
  deckOf,
  fold,
  playEvents,
  raiseTo,
  startHand,
} from '../../engine/testDeck.ts';
import { CASH } from '../../engine/index.ts';
import type { EngineEvent } from '../../engine/index.ts';
import { handRecord, MATH_BOT, recordDecision } from './record.ts';
import type { RecordMeta } from './record.ts';

const meta: RecordMeta = {
  sessionId: 's1',
  mode: CASH,
  names: ['You', 'Bot'],
  humanSeat: 0,
  bot: MATH_BOT,
  playedAt: '2026-10-23T10:00:00.000Z',
};

const board = '2c 7d 9h Js Kc';

describe('handRecord', () => {
  it('records a preflop fold with hole cards, an empty board and every event', () => {
    const step = playEvents(startHand([2000, 2000], deckOf('Qc Qd', 'Ah Kd', board)), fold);
    const record = handRecord(step.events, [], meta);
    expect(record.version).toBe(1);
    expect(record.id).toBe('s1-1');
    expect(record.handNumber).toBe(1);
    expect(record.holeCards).toEqual([
      ['Ah', 'Kd'],
      ['Qc', 'Qd'],
    ]);
    expect(record.board).toEqual([]);
    expect(record.events).toEqual(step.events);
    expect(record.mode).toEqual(CASH);
    expect(record.names).toEqual(['You', 'Bot']);
    expect(record.humanSeat).toBe(0);
    expect(record.bot).toEqual(MATH_BOT);
    expect(record.playedAt).toBe(meta.playedAt);
  });

  it('records a five card board at showdown', () => {
    const step = playEvents(
      startHand([2000, 2000], deckOf('Qc Qd', 'Ah Kd', board)),
      call,
      check,
      check,
      check,
      check,
      check,
      check,
      check,
    );
    const record = handRecord(step.events, [], meta);
    expect(record.board).toEqual(['2c', '7d', '9h', 'Js', 'Kc']);
  });

  it('records a five card board for an all-in preflop run-out', () => {
    const step = playEvents(
      startHand([2000, 2000], deckOf('Qc Qd', 'Ah Kd', board)),
      raiseTo(2000),
      call,
    );
    const record = handRecord(step.events, [], meta);
    expect(record.board).toHaveLength(5);
  });

  it('keeps a leading toppedUp event first', () => {
    const step = playEvents(startHand([2000, 2000], deckOf('Qc Qd', 'Ah Kd', board)), fold);
    const topUp: EngineEvent = { type: 'toppedUp', seat: 1, amount: 500 };
    const record = handRecord([topUp, ...step.events], [], meta);
    expect(record.events[0]).toEqual(topUp);
    expect(record.handNumber).toBe(1);
  });

  it('saves the style with a decision and leaves the key out without one', () => {
    const decision: Decision = {
      action: { kind: 'call' },
      solverChoice: 'passive',
      evByAction: { fold: 0, passive: 0, aggressive: 0 },
    };
    const style = { aggression: 1.2, bluff: 0.9, tightness: 1 };
    expect(recordDecision(decision, 3, style).style).toEqual(style);
    expect('style' in recordDecision(decision, 3)).toBe(false);
  });

  it('stores infinite expected values as null and survives JSON', () => {
    const decision: Decision = {
      action: { kind: 'fold' },
      solverChoice: 'fold',
      evByAction: { fold: 0, passive: -3.5, aggressive: Number.NEGATIVE_INFINITY },
    };
    const recorded = recordDecision(decision, 4);
    expect(recorded).toEqual({
      eventIndex: 4,
      solverChoice: 'fold',
      evByAction: { fold: 0, passive: -3.5, aggressive: null },
    });
    const step = playEvents(startHand([2000, 2000], deckOf('Qc Qd', 'Ah Kd', board)), fold);
    const record = handRecord(step.events, [recorded], meta);
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });
});
