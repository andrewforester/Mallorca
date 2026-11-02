import { describe, expect, it } from 'vitest';
import { fullDeck } from '../cards/index.ts';
import { applyAction, handHistory, startHandWith } from '../engine/index.ts';
import type { Action, EngineEvent, LogEntry, Step } from '../engine/index.ts';
import { groupHand } from './handLog.ts';

function e(key: string, params: Record<string, string | number> = {}): LogEntry {
  return { key, params };
}

const START = e('handStarted', { number: 2, small: 10, big: 20 });

describe('groupHand', () => {
  it('groups only the last hand by street with the pot at each street start', () => {
    const entries = [
      e('handStarted', { number: 1, small: 10, big: 20 }),
      e('post', { seat: 0, amount: 10 }),
      e('fold', { seat: 1 }),
      START,
      e('post', { seat: 0, amount: 10 }),
      e('post', { seat: 1, amount: 20 }),
      e('raise', { seat: 0, amount: 60 }),
      e('call', { seat: 1, amount: 40 }),
      e('flop', { cards: 'As Td 3h', pot: 120 }),
      e('check', { seat: 1 }),
      e('bet', { seat: 0, amount: 80 }),
      e('call', { seat: 1, amount: 80 }),
      e('turn', { cards: '2c', pot: 280 }),
    ];
    const groups = groupHand(entries);
    expect(groups.map((g) => g.street)).toEqual(['preflop', 'flop', 'turn']);
    expect(groups[0]).toMatchObject({ cards: [], pot: 0 });
    expect(groups[0]?.entries.length).toBe(4);
    expect(groups[1]).toMatchObject({ cards: ['As', 'Td', '3h'], pot: 120 });
    expect(groups[1]?.entries.length).toBe(3);
    expect(groups[2]).toMatchObject({ cards: ['2c'], pot: 280 });
    expect(groups[2]?.entries.length).toBe(0);
  });

  it('keeps the result lines of a preflop fold in the preflop group', () => {
    const groups = groupHand([
      START,
      e('post', { seat: 0, amount: 10 }),
      e('post', { seat: 1, amount: 20 }),
      e('fold', { seat: 0 }),
      e('returned', { seat: 1, amount: 10 }),
      e('win', { seat: 1, amount: 20 }),
    ]);
    expect(groups.length).toBe(1);
    expect(groups[0]?.entries.slice(-2).map((x) => x.key)).toEqual(['returned', 'win']);
  });

  it('ends with a showdown group holding the show entries', () => {
    const groups = groupHand([
      START,
      e('post', { seat: 0, amount: 10 }),
      e('post', { seat: 1, amount: 20 }),
      e('call', { seat: 0, amount: 10 }),
      e('river', { cards: 'Kc', pot: 40 }),
      e('show', { seat: 0, cards: 'Ah Ad', category: 'pair', pot: 40 }),
      e('show', { seat: 1, cards: 'Qh Qd', category: 'pair', pot: 40 }),
      e('win', { seat: 0, amount: 40 }),
    ]);
    const last = groups[groups.length - 1];
    expect(last?.street).toBe('showdown');
    expect(last?.cards).toEqual([]);
    expect(last?.pot).toBe(40);
    expect(last?.entries.map((x) => x.key)).toEqual(['show', 'show', 'win']);
  });

  it('counts only matched chips into the pot after an all-in with unequal stacks', () => {
    const groups = groupHand([
      START,
      e('post', { seat: 0, amount: 10 }),
      e('post', { seat: 1, amount: 20 }),
      e('raise', { seat: 0, amount: 1000 }),
      e('call', { seat: 1, amount: 380 }),
      e('allIn', { seat: 1 }),
      e('flop', { cards: 'As Td 3h', pot: 800 }),
      e('turn', { cards: '2c', pot: 800 }),
      e('river', { cards: 'Kc', pot: 800 }),
      e('show', { seat: 0, cards: 'Ah Ad', category: 'pair', pot: 800 }),
      e('show', { seat: 1, cards: 'Qh Qd', category: 'pair', pot: 800 }),
      e('returned', { seat: 0, amount: 600 }),
      e('win', { seat: 0, amount: 800 }),
    ]);
    expect(groups.map((g) => [g.street, g.pot])).toEqual([
      ['preflop', 0],
      ['flop', 800],
      ['turn', 800],
      ['river', 800],
      ['showdown', 800],
    ]);
  });

  it('adds a postflop bet, raise and call to the next pot', () => {
    const groups = groupHand([
      START,
      e('post', { seat: 0, amount: 10 }),
      e('post', { seat: 1, amount: 20 }),
      e('call', { seat: 0, amount: 10 }),
      e('check', { seat: 1 }),
      e('flop', { cards: 'As Td 3h', pot: 40 }),
      e('bet', { seat: 1, amount: 80 }),
      e('raise', { seat: 0, amount: 240 }),
      e('call', { seat: 1, amount: 160 }),
      e('turn', { cards: '2c', pot: 520 }),
    ]);
    expect(groups[1]?.pot).toBe(40);
    expect(groups[2]?.pot).toBe(520);
  });

  it('puts the top-ups before the hand at the head of the preflop group', () => {
    const groups = groupHand([
      e('handStarted', { number: 1, small: 10, big: 20 }),
      e('fold', { seat: 1 }),
      e('toppedUp', { seat: 1, amount: 500 }),
      START,
      e('post', { seat: 0, amount: 10 }),
    ]);
    expect(groups[0]?.entries.map((x) => x.key)).toEqual(['toppedUp', 'post']);
  });

  it('keeps top-ups from earlier hands out of the current hand', () => {
    const groups = groupHand([
      e('toppedUp', { seat: 0, amount: 300 }),
      e('handStarted', { number: 1, small: 10, big: 20 }),
      e('fold', { seat: 1 }),
      START,
      e('post', { seat: 0, amount: 10 }),
    ]);
    expect(groups[0]?.entries.map((x) => x.key)).toEqual(['post']);
  });
  it('groups the log of a hand played by the engine', () => {
    const actions: Action[] = [
      { kind: 'raise', to: 60 },
      { kind: 'call' },
      { kind: 'check' },
      { kind: 'raise', to: 80 },
      { kind: 'call' },
      { kind: 'check' },
      { kind: 'check' },
      { kind: 'check' },
      { kind: 'check' },
    ];
    const seats: Step['seats'] = [
      { name: 'A', stack: 2000 },
      { name: 'B', stack: 2000 },
    ];
    let step = startHandWith(
      seats,
      { button: 0, blinds: { small: 10, big: 20 }, handNumber: 1 },
      fullDeck(),
    );
    const events: EngineEvent[] = [...step.events];
    for (const action of actions) {
      step = applyAction(step.hand, step.seats, action);
      events.push(...step.events);
    }
    expect(groupHand(handHistory(events)).map((g) => [g.street, g.pot])).toEqual([
      ['preflop', 0],
      ['flop', 120],
      ['turn', 280],
      ['river', 280],
      ['showdown', 280],
    ]);
  });
});
