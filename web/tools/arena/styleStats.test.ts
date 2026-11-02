import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '../../src/engine/index.ts';
import {
  call,
  check,
  deckOf,
  fold,
  playEvents,
  raiseTo,
  startHand,
} from '../../src/engine/testDeck.ts';
import type { Action } from '../../src/engine/index.ts';
import { styleStats } from './styleStats.ts';

const deck = deckOf('7c 2d', 'As Ks', 'Qh 9h 3c 4d 5s');

const hand = (...actions: Action[]): EngineEvent[] =>
  playEvents(startHand([2000, 2000], deck, 0), ...actions).events;

const raisedAndFolded = hand(raiseTo(60), call, check, raiseTo(60), raiseTo(180), fold);
const foldedPreflop = hand(fold);
const limpedToShowdown = hand(call, check, raiseTo(20), call, check, check, check, check);

describe('styleStats', () => {
  it('counts preflop and postflop actions of the button', () => {
    expect(styleStats([raisedAndFolded], () => 0)).toEqual({
      hands: 1,
      vpip: 1,
      pfr: 1,
      aggressionFactor: Infinity,
      betFrequency: 0.5,
      foldToBet: 1,
      raiseFrequency: 0,
      postflopDecisions: 2,
      facedBets: 1,
      betSize: 60 / 120,
      preflopRaiseSize: 50 / 30,
    });
  });

  it('counts a raise facing a bet for the big blind', () => {
    expect(styleStats([raisedAndFolded], () => 1)).toEqual({
      hands: 1,
      vpip: 1,
      pfr: 0,
      aggressionFactor: Infinity,
      betFrequency: 0.5,
      foldToBet: 0,
      raiseFrequency: 1,
      postflopDecisions: 2,
      facedBets: 1,
      betSize: 180 / 180,
      preflopRaiseSize: 0,
    });
  });

  it('a fold before the flop and a check of the big blind are not voluntary', () => {
    const stats = styleStats([foldedPreflop, limpedToShowdown], () => 1);
    expect(stats.hands).toBe(2);
    expect(stats.vpip).toBe(0);
    expect(stats.pfr).toBe(0);
    expect(stats.postflopDecisions).toBe(3);
    expect(stats.betFrequency).toBeCloseTo(1 / 3);
    expect(stats.facedBets).toBe(0);
    expect(stats.foldToBet).toBe(0);
  });

  it('chooses the seat per hand and divides bets and raises by calls after the flop', () => {
    const stats = styleStats([raisedAndFolded, limpedToShowdown], (index) => (index === 0 ? 1 : 0));
    expect(stats.hands).toBe(2);
    expect(stats.vpip).toBe(1);
    expect(stats.pfr).toBe(0);
    expect(stats.postflopDecisions).toBe(5);
    expect(stats.aggressionFactor).toBe(1);
    expect(stats.betFrequency).toBeCloseTo(1 / 5);
    expect(stats.facedBets).toBe(2);
    expect(stats.raiseFrequency).toBe(0.5);
    expect(stats.foldToBet).toBe(0);
  });
});
