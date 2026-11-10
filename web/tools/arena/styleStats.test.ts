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
import { parseCards } from '../../src/cards/index.ts';
import { BLUFF_STRENGTH, riverStrength, styleStats } from './styleStats.ts';

const deck = deckOf('7c 2d', 'As Ks', 'Qh 9h 3c 4d 5s');

const hand = (...actions: Action[]): EngineEvent[] =>
  playEvents(startHand([2000, 2000], deck, 0), ...actions).events;

const raisedAndFolded = hand(raiseTo(60), call, check, raiseTo(60), raiseTo(180), fold);
const foldedPreflop = hand(fold);
const riverStab = hand(call, check, check, check, check, check, check, raiseTo(40), fold);
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
      riverBets: 0,
      riverBluffShare: 0,
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
      riverBets: 0,
      riverBluffShare: 0,
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

  it('counts a river bet with a hand that beats less than a third of the hands as a bluff', () => {
    expect(riverStrength([0, 1], [2, 3, 4, 5, 6])).toBeGreaterThan(0);
    const button = styleStats([riverStab, limpedToShowdown], () => 0);
    expect(button.riverBets).toBe(1);
    expect(button.riverBluffShare).toBe(1);
    const blind = styleStats([riverStab], () => 1);
    expect(blind.riverBets).toBe(0);
    expect(blind.riverBluffShare).toBe(0);
  });

  it('rates a river hand by the share of the other hands it beats', () => {
    const cards = (text: string) => parseCards(text);
    expect(riverStrength(cards('7c 2d'), cards('Qh 9h 3c 4d 5s'))).toBeLessThan(BLUFF_STRENGTH);
    expect(riverStrength(cards('As Ah'), cards('Ad Ac 3c 4d 9s'))).toBe(1);
    const middle = riverStrength(cards('Qs Jd'), cards('Qh 9h 3c 4d 2s'));
    expect(middle).toBeGreaterThan(0.6);
    expect(middle).toBeLessThan(1);
  });
});
