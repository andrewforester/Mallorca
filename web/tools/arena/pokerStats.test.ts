import { describe, expect, it } from 'vitest';
import type { Action, EngineEvent } from '../../src/engine/index.ts';
import {
  call,
  check,
  deckOf,
  fold,
  playEvents,
  raiseTo,
  startHand,
} from '../../src/engine/testDeck.ts';
import { pokerStats } from './pokerStats.ts';
import type { PokerStats } from './pokerStats.ts';

const deck = deckOf('7c 2d', 'As Ks', 'Qh 9h 3c 4d 5s');

const hand = (...actions: Action[]): EngineEvent[] =>
  playEvents(startHand([2000, 2000], deck, 0), ...actions).events;

const checkRaised = hand(raiseTo(60), call, check, raiseTo(60), raiseTo(180), fold);
const threeBet = hand(raiseTo(60), raiseTo(180), fold);
const limpedToShowdown = hand(call, check, raiseTo(20), call, check, check, check, check);

const none = { rate: 0, of: 0 };
const rate = (hit: number, of: number) => ({ rate: hit / of, of });

const empty: PokerStats = {
  hands: 1,
  steal: none,
  limp: none,
  bigBlindDefence: none,
  threeBet: none,
  foldToThreeBet: none,
  continuationBet: none,
  foldToContinuationBet: none,
  donkBet: none,
  checkRaise: none,
  foldToFlopBet: none,
  foldToTurnBet: none,
  foldToRiverBet: none,
  wentToShowdown: none,
  wonAtShowdown: none,
};

describe('pokerStats', () => {
  it('counts the open, the continuation bet and the fold to a check-raise of the button', () => {
    expect(pokerStats([checkRaised], () => 0)).toEqual({
      ...empty,
      steal: rate(1, 1),
      limp: rate(0, 1),
      continuationBet: rate(1, 1),
      foldToFlopBet: rate(1, 1),
      wentToShowdown: rate(0, 1),
    });
  });

  it('counts the defence, the check-raise and the missed donk bet of the big blind', () => {
    expect(pokerStats([checkRaised], () => 1)).toEqual({
      ...empty,
      bigBlindDefence: rate(1, 1),
      threeBet: rate(0, 1),
      foldToContinuationBet: rate(0, 1),
      donkBet: rate(0, 1),
      checkRaise: rate(1, 1),
      foldToFlopBet: rate(0, 1),
      wentToShowdown: rate(0, 1),
    });
  });

  it('counts a three-bet and the fold to it', () => {
    const blind = pokerStats([threeBet], () => 1);
    expect(blind.bigBlindDefence).toEqual(rate(1, 1));
    expect(blind.threeBet).toEqual(rate(1, 1));
    const button = pokerStats([threeBet], () => 0);
    expect(button.steal).toEqual(rate(1, 1));
    expect(button.foldToThreeBet).toEqual(rate(1, 1));
    expect(button.wentToShowdown).toEqual(none);
  });

  it('counts a limp to showdown and who won it, with no aggressor after the flop', () => {
    const button = pokerStats([limpedToShowdown], () => 0);
    expect(button.limp).toEqual(rate(1, 1));
    expect(button.steal).toEqual(rate(0, 1));
    expect(button.foldToFlopBet).toEqual(rate(0, 1));
    expect(button.continuationBet).toEqual(none);
    expect(button.wentToShowdown).toEqual(rate(1, 1));
    expect(button.wonAtShowdown).toEqual(rate(1, 1));
    const blind = pokerStats([limpedToShowdown], () => 1);
    expect(blind.bigBlindDefence).toEqual(none);
    expect(blind.donkBet).toEqual(none);
    expect(blind.wonAtShowdown).toEqual(rate(0, 1));
  });

  it('adds hands up and chooses the seat per hand', () => {
    const stats = pokerStats([checkRaised, limpedToShowdown], (index) => (index === 0 ? 0 : 1));
    expect(stats.hands).toBe(2);
    expect(stats.steal).toEqual(rate(1, 1));
    expect(stats.wentToShowdown).toEqual(rate(1, 2));
  });
});
