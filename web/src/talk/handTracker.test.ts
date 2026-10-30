import { describe, expect, it } from 'vitest';
import { parseCards } from '../cards/index.ts';
import type { Card } from '../cards/index.ts';
import { call, check, deckOf, playEvents, raiseTo, startHand } from '../engine/testDeck.ts';
import type { EngineEvent, SeatIndex } from '../engine/types.ts';
import { equityVsHand } from '../equity/index.ts';
import { NO_HAND, luckOf, netOf, track } from './handTracker.ts';
import type { HandState } from './handTracker.ts';

const HER: SeatIndex = 1;

const replay = (events: readonly EngineEvent[]): HandState =>
  events.reduce((state, event) => track(state, event, HER), NO_HAND);

describe('track', () => {
  it('writes the hand as short plain text and follows pot, stacks and board', () => {
    const start = startHand([2000, 2000], deckOf('Ah Ad', '7c 2d', 'Qs Jh 7d 4c 9h'));
    const mid = playEvents(start, raiseTo(60), call, raiseTo(100));
    const state = replay(mid.events);
    expect(state.actions).toEqual([
      'player posts 10',
      'Mallorca posts 20',
      'player raises to 60',
      'Mallorca calls 40',
      'flop Qs Jh 7d',
      'Mallorca raises to 100',
    ]);
    expect(state.handNumber).toBe(1);
    expect(state.street).toBe('flop');
    expect(state.board).toEqual(parseCards('Qs Jh 7d'));
    expect(state.pot).toBe(220);
    expect(state.stacks).toEqual([1940, 1840]);
    expect(state.her).toEqual(parseCards('Ah Ad'));
    expect(state.bigBlind).toBe(20);
  });

  it('closes the hand with the stacks of handEnded and the net in big blinds', () => {
    const start = startHand([2000, 2000], deckOf('Ah Ad', '7c 2d', 'Qs Jh 7d 4c 9h'));
    const end = playEvents(start, raiseTo(60), call, check, check, check, check, check, check);
    const state = replay(end.events);
    expect(state.ended).toBe(true);
    expect(state.street).toBe('complete');
    expect(state.stacks).toEqual([1940, 2060]);
    expect(state.awarded).toEqual([0, 120]);
    expect(state.actions).toContain('player shows 7c 2d');
    expect(state.actions).toContain('Mallorca wins 120');
    expect(netOf(state, HER)).toBe(3);
  });

  it('marks her bet on the turn or river and the player bet on the river', () => {
    const start = startHand([2000, 2000], deckOf('Ah Ad', '7c 2d', 'Qs Jh 7d 4c 9h'));
    const end = playEvents(start, call, check, check, check, raiseTo(40), call, check, raiseTo(80));
    const state = replay(end.events);
    expect(state.herLateBet).toBe(true);
    expect(state.playerRiverBet).toBe(true);
    expect(state.playerAllIn).toBe(false);
  });
});

describe('luckOf', () => {
  it('is null when the last betting came on the river', () => {
    const start = startHand([2000, 2000], deckOf('Ah Ad', '7c 2d', 'Qs Jh 7d 4c 9h'));
    const end = playEvents(start, raiseTo(60), call, check, check, check, check, check, check);
    expect(luckOf(replay(end.events), HER)).toBeNull();
  });

  it('is null when nobody reached a showdown', () => {
    const start = startHand([2000, 2000], deckOf('Ah Ad', '7c 2d', 'Qs Jh 7d 4c 9h'));
    const end = playEvents(start, raiseTo(60), { kind: 'fold' });
    expect(luckOf(replay(end.events), HER)).toBeNull();
  });

  it('measures the chips won against her equity at the all-in board', () => {
    const start = startHand([2000, 2000], deckOf('Ah Ad', '7c 2d', 'Qs 7h 7d 4c 9h'));
    const end = playEvents(start, call, check, raiseTo(1980), call);
    const state = replay(end.events);
    expect(state.playerAllIn).toBe(true);
    const equity = equityVsHand(
      parseCards('Ah Ad') as [Card, Card],
      parseCards('7c 2d') as [Card, Card],
      parseCards('Qs 7h 7d'),
    );
    expect(luckOf(state, HER)).toBeCloseTo((0 - equity * 4000) / 20, 9);
    expect(netOf(state, HER)).toBe(-100);
  });
});
