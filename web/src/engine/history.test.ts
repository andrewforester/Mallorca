import { describe, expect, it } from 'vitest';
import { startHandWith } from './hand.ts';
import { handHistory } from './history.ts';
import { call, check, deckOf, fold, playEvents, raiseTo } from './testDeck.ts';
import type { Seat } from './types.ts';

const seats: [Seat, Seat] = [
  { name: 'Mallorca', stack: 2000 },
  { name: 'You', stack: 2000 },
];

describe('handHistory', () => {
  it('describes a hand that goes to showdown with locale keys and seat indices', () => {
    const deck = deckOf('Ah Ad', '7c 2d', 'Qs Jh 7d 4c 9h');
    const start = startHandWith(
      seats,
      { button: 0, blinds: { small: 10, big: 20 }, handNumber: 1 },
      deck,
    );
    const end = playEvents(start, raiseTo(60), call, check, check, check, check, check, check);
    expect(handHistory(end.events)).toEqual([
      { key: 'handStarted', params: { number: 1, small: 10, big: 20 } },
      { key: 'post', params: { seat: 0, amount: 10 } },
      { key: 'post', params: { seat: 1, amount: 20 } },
      { key: 'raise', params: { seat: 0, amount: 60 } },
      { key: 'call', params: { seat: 1, amount: 40 } },
      { key: 'flop', params: { cards: 'Qs Jh 7d', pot: 120 } },
      { key: 'check', params: { seat: 1 } },
      { key: 'check', params: { seat: 0 } },
      { key: 'turn', params: { cards: '4c', pot: 120 } },
      { key: 'check', params: { seat: 1 } },
      { key: 'check', params: { seat: 0 } },
      { key: 'river', params: { cards: '9h', pot: 120 } },
      { key: 'check', params: { seat: 1 } },
      { key: 'check', params: { seat: 0 } },
      { key: 'show', params: { seat: 0, cards: '7c 2d', category: 'pair', pot: 120 } },
      { key: 'show', params: { seat: 1, cards: 'Ah Ad', category: 'pair', pot: 120 } },
      { key: 'win', params: { seat: 1, amount: 120 } },
    ]);
  });

  it('describes folds, uncalled bets, all-ins and the end of the tournament', () => {
    const deck = deckOf('Ah Ad', '7c 2d', 'Qs Jh 7d 4c 9h');
    const start = startHandWith(
      seats,
      { button: 1, blinds: { small: 10, big: 20 }, handNumber: 4 },
      deck,
    );
    const folded = playEvents(start, fold);
    expect(handHistory(folded.events)).toEqual([
      { key: 'handStarted', params: { number: 4, small: 10, big: 20 } },
      { key: 'post', params: { seat: 1, amount: 10 } },
      { key: 'post', params: { seat: 0, amount: 20 } },
      { key: 'fold', params: { seat: 1 } },
      { key: 'returned', params: { seat: 0, amount: 10 } },
      { key: 'win', params: { seat: 0, amount: 20 } },
    ]);
    const shove = playEvents(
      startHandWith(seats, { button: 0, blinds: { small: 10, big: 20 }, handNumber: 1 }, deck),
      raiseTo(2000),
      call,
    );
    const entries = handHistory([...shove.events, { type: 'tournamentEnded', winner: 1 }]);
    expect(entries).toContainEqual({ key: 'allIn', params: { seat: 0 } });
    expect(entries).toContainEqual({ key: 'allIn', params: { seat: 1 } });
    expect(entries.at(-1)).toEqual({ key: 'winTournament', params: { seat: 1 } });
  });

  it('describes a top-up', () => {
    expect(handHistory([{ type: 'toppedUp', seat: 1, amount: 1400 }])).toEqual([
      { key: 'toppedUp', params: { seat: 1, amount: 1400 } },
    ]);
  });
});
