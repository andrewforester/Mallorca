import { describe, expect, it } from 'vitest';
import { legalActions } from './legal.ts';
import type { EngineEvent } from './types.ts';
import { call, check, deckOf, fold, play, playEvents, raiseTo, startHand } from './testDeck.ts';

const aaWins = deckOf('Ah Ad', '7c 2d', 'Kc 9d 4s 6h Jc');
const buttonWins = deckOf('7c 2d', 'Ah Ad', 'Kc 9d 4s 6h Jc');
const royal = deckOf('2c 3d', '4c 5d', 'As Ks Qs Js Ts');

const types = (events: { type: string }[]) => events.map((e) => e.type);
const stacksOf = (step: { seats: { stack: number }[] }) => step.seats.map((s) => s.stack);

describe('scenario table', () => {
  it('button posts the small blind and acts first preflop; the big blind acts first on the flop', () => {
    const preflop = startHand([2000, 2000], aaWins);
    expect(preflop.hand.toAct).toBe(0);
    const flop = play(preflop, call, check);
    expect(flop.hand.street).toBe('flop');
    expect(flop.hand.board).toEqual(aaWins.slice(4, 7));
    expect(flop.hand.toAct).toBe(1);
    expect(flop.hand.bets).toEqual([0, 0]);
    expect(flop.hand.pot).toBe(40);
  });

  it('check-check advances every street to showdown', () => {
    const step = playEvents(
      startHand([2000, 2000], aaWins),
      call,
      check,
      check,
      check,
      check,
      check,
      check,
      check,
    );
    expect(step.hand.street).toBe('complete');
    expect(step.hand.board).toEqual(aaWins.slice(4, 9));
    expect(
      step.events
        .filter((e) => e.type === 'streetDealt')
        .map((e) => (e as { street: string }).street),
    ).toEqual(['flop', 'turn', 'river']);
    expect(types(step.events).slice(-3)).toEqual(['showdown', 'potAwarded', 'handEnded']);
    expect(stacksOf(step)).toEqual([1980, 2020]);
  });

  it('min raise preflop is to 40, after a raise to 60 the min re-raise is to 100', () => {
    const start = startHand([2000, 2000], aaWins);
    expect(legalActions(start.hand, start.seats).raise?.min).toBe(40);
    const raised = play(start, raiseTo(60));
    expect(legalActions(raised.hand, raised.seats)).toMatchObject({
      call: 40,
      raise: { min: 100, max: 2000 },
    });
    const reraised = play(raised, raiseTo(100));
    expect(legalActions(reraised.hand, reraised.seats)).toMatchObject({
      call: 40,
      raise: { min: 140 },
    });
  });

  it('min raise on a later street is at least the big blind', () => {
    const flop = play(startHand([2000, 2000], aaWins), call, check);
    expect(legalActions(flop.hand, flop.seats).raise).toEqual({ min: 20, max: 1980 });
    const bet = play(flop, raiseTo(50));
    expect(legalActions(bet.hand, bet.seats).raise).toEqual({ min: 100, max: 1980 });
  });

  it('a short all-in raise does not reopen betting for the player who already acted', () => {
    const flop = play(startHand([200, 2000], aaWins), call, check);
    const bet = play(flop, raiseTo(100));
    expect(legalActions(bet.hand, bet.seats)).toMatchObject({
      call: 100,
      raise: { min: 180, max: 180 },
    });
    const shortRaise = play(bet, raiseTo(180));
    expect(shortRaise.hand.toAct).toBe(1);
    expect(legalActions(shortRaise.hand, shortRaise.seats)).toEqual({
      fold: true,
      check: false,
      call: 80,
      raise: null,
    });
  });

  it('a full raise reopens betting', () => {
    const flop = play(startHand([2000, 2000], aaWins), call, check);
    const reraised = play(flop, raiseTo(100), raiseTo(200));
    expect(legalActions(reraised.hand, reraised.seats).raise).toEqual({ min: 300, max: 1980 });
  });

  it('a raise to the opponent stack and beyond returns the excess', () => {
    const step = playEvents(startHand([2000, 100], aaWins), raiseTo(300), call);
    expect(step.hand.street).toBe('complete');
    const awards = step.events.filter((e) => e.type === 'potAwarded' || e.type === 'betReturned');
    expect(awards).toEqual([
      { type: 'betReturned', seat: 0, amount: 200 },
      { type: 'potAwarded', seat: 1, amount: 200 },
    ]);
    expect(stacksOf(step)).toEqual([1900, 200]);
    expect(stacksOf(step)[0]! + stacksOf(step)[1]!).toBe(2100);
  });

  it('the excess goes back when the big stack wins too', () => {
    const step = playEvents(startHand([2000, 100], buttonWins), raiseTo(300), call);
    expect(stacksOf(step)).toEqual([2100, 0]);
    const awards = step.events.filter((e) => e.type === 'potAwarded' || e.type === 'betReturned');
    expect(awards).toEqual([
      { type: 'betReturned', seat: 0, amount: 200 },
      { type: 'potAwarded', seat: 0, amount: 200 },
    ]);
  });

  it('a postflop bet bigger than the opponent stack is refunded in part', () => {
    const flop = play(startHand([200, 2000], aaWins), call, check);
    const step = playEvents(flop, raiseTo(500), call);
    expect(step.hand.street).toBe('complete');
    expect(stacksOf(step)).toEqual([0, 2200]);
    const awards = step.events.filter((e) => e.type === 'potAwarded' || e.type === 'betReturned');
    expect(awards).toEqual([
      { type: 'betReturned', seat: 1, amount: 320 },
      { type: 'potAwarded', seat: 1, amount: 400 },
    ]);
  });

  it('both all-in preflop runs out flop, turn and river then shows down', () => {
    const start = startHand([500, 500], aaWins);
    const step = playEvents(start, raiseTo(500), call);
    expect(types(step.events)).toEqual([
      'handStarted',
      'blindPosted',
      'blindPosted',
      'holeCards',
      'holeCards',
      'acted',
      'acted',
      'streetDealt',
      'streetDealt',
      'streetDealt',
      'showdown',
      'potAwarded',
      'handEnded',
    ]);
    const dealt = step.events.filter((e) => e.type === 'streetDealt') as {
      cards: number[];
      board: number[];
    }[];
    expect(dealt.map((e) => e.cards.length)).toEqual([3, 1, 1]);
    expect(dealt.map((e) => e.board.length)).toEqual([3, 4, 5]);
    expect(stacksOf(step)).toEqual([0, 1000]);
    expect(step.events.at(-1)).toEqual({ type: 'handEnded', stacks: [0, 1000] });
    expect(step.events.filter((e) => e.type === 'acted')[1]).toMatchObject({
      allIn: true,
      amount: 480,
    });
  });

  it('showdown reports ranks and categories', () => {
    const step = playEvents(startHand([500, 500], aaWins), raiseTo(500), call);
    const showdown = step.events.find((e) => e.type === 'showdown') as unknown as {
      hands: { rank: number; category: string }[];
    };
    expect(showdown.hands[1]!.category).toBe('pair');
    expect(showdown.hands[1]!.rank).toBeGreaterThan(showdown.hands[0]!.rank);
  });

  it('splits the pot on a tie', () => {
    const step = playEvents(startHand([500, 500], royal), raiseTo(500), call);
    expect(stacksOf(step)).toEqual([500, 500]);
    const awards = step.events.filter((e) => e.type === 'potAwarded');
    expect(awards).toEqual([
      { type: 'potAwarded', seat: 0, amount: 500 },
      { type: 'potAwarded', seat: 1, amount: 500 },
    ]);
  });

  it('a fold awards the pot without a showdown', () => {
    const step = playEvents(startHand([2000, 2000], aaWins), fold);
    expect(types(step.events).slice(-4)).toEqual([
      'acted',
      'betReturned',
      'potAwarded',
      'handEnded',
    ]);
    expect(step.events.filter((e) => e.type === 'betReturned' || e.type === 'potAwarded')).toEqual([
      { type: 'betReturned', seat: 1, amount: 10 },
      { type: 'potAwarded', seat: 1, amount: 20 },
    ]);
    expect(types(step.events)).not.toContain('showdown');
    expect(stacksOf(step)).toEqual([1990, 2010]);
    expect(step.hand.street).toBe('complete');
    expect(step.hand.toAct).toBeNull();
    expect(step.hand.pot).toBe(0);
  });

  it('a fold facing a bet gives the bettor the whole pot', () => {
    const flop = play(startHand([2000, 2000], aaWins), call, check);
    const step = play(flop, raiseTo(100), fold);
    expect(stacksOf(step)).toEqual([1980, 2020]);
    expect(step.events.slice(-3)).toEqual([
      { type: 'betReturned', seat: 1, amount: 100 },
      { type: 'potAwarded', seat: 1, amount: 40 },
      { type: 'handEnded', stacks: [1980, 2020] },
    ]);
  });

  it('a fold to a raise returns the uncalled part and awards the matched pot', () => {
    const step = playEvents(startHand([2000, 2000], aaWins), raiseTo(60), fold);
    expect(stacksOf(step)).toEqual([2020, 1980]);
    expect(types(step.events).slice(-4)).toEqual([
      'acted',
      'betReturned',
      'potAwarded',
      'handEnded',
    ]);
    expect(step.events.filter((e) => e.type === 'betReturned' || e.type === 'potAwarded')).toEqual([
      { type: 'betReturned', seat: 0, amount: 40 },
      { type: 'potAwarded', seat: 0, amount: 40 },
    ]);
  });

  it('a big blind with 15 chips posts all-in and the hand runs out', () => {
    const start = startHand([2000, 15], aaWins);
    expect(start.hand.bets).toEqual([10, 15]);
    expect(stacksOf(start)).toEqual([1990, 0]);
    expect(start.hand.toAct).toBe(0);
    expect(legalActions(start.hand, start.seats)).toEqual({
      fold: true,
      check: false,
      call: 5,
      raise: null,
    });
    const step = playEvents(start, call);
    expect(step.hand.street).toBe('complete');
    expect(types(step.events)).toContain('showdown');
    expect(types(step.events).filter((t) => t === 'streetDealt')).toHaveLength(3);
    expect(stacksOf(step)).toEqual([1985, 30]);
  });

  it('a small blind who cannot cover the big blind has the hand run out when the big blind is covered', () => {
    const start = startHand([15, 2000], aaWins);
    expect(start.hand.bets).toEqual([10, 20]);
    expect(start.hand.toAct).toBe(0);
    const step = playEvents(start, call);
    expect(step.hand.street).toBe('complete');
    expect(types(step.events).filter((t) => t === 'streetDealt')).toHaveLength(3);
  });

  it('a blind post larger than the stack runs out at once', () => {
    const step = startHand([15, 2000], aaWins, 1);
    expect(step.hand.bets).toEqual([15, 10]);
    expect(step.hand.street).toBe('preflop');
    const allIn = startHand([5, 2000], aaWins, 0, { small: 10, big: 20 });
    expect(
      allIn.events
        .filter((e) => e.type === 'blindPosted')
        .map((e) => (e as { amount: number }).amount),
    ).toEqual([5, 20]);
    expect(allIn.hand.street).toBe('complete');
    expect(types(allIn.events).slice(-7)).toEqual([
      'streetDealt',
      'streetDealt',
      'streetDealt',
      'showdown',
      'betReturned',
      'potAwarded',
      'handEnded',
    ]);
    expect(allIn.events.find((e) => e.type === 'betReturned')).toEqual({
      type: 'betReturned',
      seat: 1,
      amount: 15,
    });
    expect(stacksOf(allIn)[0]! + stacksOf(allIn)[1]!).toBe(2005);
  });
  it('every dealt street and the showdown carry the pot of the matched chips', () => {
    const pots = (events: EngineEvent[]) =>
      events.flatMap((e) =>
        e.type === 'streetDealt' || e.type === 'showdown' ? [[e.type, e.pot]] : [],
      );
    const played = playEvents(
      startHand([2000, 2000], aaWins),
      raiseTo(60),
      call,
      check,
      raiseTo(80),
      call,
      check,
      check,
      check,
      check,
    );
    expect(pots(played.events)).toEqual([
      ['streetDealt', 120],
      ['streetDealt', 280],
      ['streetDealt', 280],
      ['showdown', 280],
    ]);
    const allIn = playEvents(startHand([1000, 400], aaWins), raiseTo(1000), call);
    expect(pots(allIn.events)).toEqual([
      ['streetDealt', 800],
      ['streetDealt', 800],
      ['streetDealt', 800],
      ['showdown', 800],
    ]);
  });
});
