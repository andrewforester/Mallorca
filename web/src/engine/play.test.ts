import { describe, expect, it } from 'vitest';
import { checkOrCall, isLegal } from './legal.ts';
import { playToEnd } from './play.ts';
import { deckOf, raiseTo, startHand } from './testDeck.ts';
import type { LegalActions, SeatIndex, Step } from './types.ts';

const deck = deckOf('Ah Ad', '7c 2d', 'Kc 9d 4s 6h Jc');
const FACING: LegalActions = { fold: true, check: false, call: 40, raise: { min: 120, max: 900 } };
const FREE: LegalActions = { fold: false, check: true, call: null, raise: null };

describe('isLegal', () => {
  it('accepts what the legal actions offer', () => {
    expect(isLegal(FACING, { kind: 'fold' })).toBe(true);
    expect(isLegal(FACING, { kind: 'call' })).toBe(true);
    expect(isLegal(FACING, raiseTo(120))).toBe(true);
    expect(isLegal(FACING, raiseTo(900))).toBe(true);
    expect(isLegal(FREE, { kind: 'check' })).toBe(true);
  });

  it('refuses what they do not offer, a raise out of range and a fractional raise', () => {
    expect(isLegal(FACING, { kind: 'check' })).toBe(false);
    expect(isLegal(FREE, { kind: 'fold' })).toBe(false);
    expect(isLegal(FREE, { kind: 'call' })).toBe(false);
    expect(isLegal(FREE, raiseTo(40))).toBe(false);
    expect(isLegal(FACING, raiseTo(119))).toBe(false);
    expect(isLegal(FACING, raiseTo(901))).toBe(false);
    expect(isLegal(FACING, raiseTo(120.5))).toBe(false);
  });
});

describe('checkOrCall', () => {
  it('checks when checking is free and calls otherwise', () => {
    expect(checkOrCall(FREE)).toEqual({ kind: 'check' });
    expect(checkOrCall(FACING)).toEqual({ kind: 'call' });
  });
});

describe('playToEnd', () => {
  it('asks the seat to act until the hand completes and reports every step from the start', () => {
    const start = startHand([2000, 2000], deck);
    const asked: SeatIndex[] = [];
    const steps: Step[] = [];
    const end = playToEnd(
      start,
      (seat, legal) => {
        asked.push(seat);
        return checkOrCall(legal);
      },
      (step) => steps.push(step),
    );
    expect(end.hand.street).toBe('complete');
    expect(steps[0]).toBe(start);
    expect(steps.at(-1)).toBe(end);
    expect(steps).toHaveLength(asked.length + 1);
    expect(asked.slice(0, 4)).toEqual([0, 1, 1, 0]);
    expect(end.seats.map((s) => s.stack)).toEqual([1980, 2020]);
  });

  it('returns the start when nobody is to act', () => {
    const start = startHand([10, 2000], deck);
    const end = playToEnd(
      start,
      () => {
        throw new Error('nobody should be asked');
      },
      () => undefined,
    );
    expect(start.hand.street).toBe('complete');
    expect(end).toBe(start);
  });
});
