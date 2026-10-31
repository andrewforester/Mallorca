import { describe, expect, it } from 'vitest';
import type { Action, EngineEvent, SeatIndex } from '../engine/index.ts';
import { spotOf } from './spots.ts';

function start(button: SeatIndex): EngineEvent {
  return {
    type: 'handStarted',
    handNumber: 1,
    button,
    smallBlind: 10,
    bigBlind: 20,
    stacks: [2000, 2000],
  };
}

function act(seat: SeatIndex, action: Action): EngineEvent {
  return { type: 'acted', seat, action, amount: 0, allIn: false };
}

function street(name: 'flop' | 'turn' | 'river'): EngineEvent {
  return { type: 'streetDealt', street: name, cards: [], board: [], pot: 100 };
}

const raise = (to: number): Action => ({ kind: 'raise', to });
const call: Action = { kind: 'call' };
const check: Action = { kind: 'check' };

describe('spotOf', () => {
  it('names the preflop spots', () => {
    expect(spotOf([start(0)], 0)).toBe('open');
    expect(spotOf([start(1), act(1, raise(50))], 0)).toBe('threeBet');
    expect(spotOf([start(0), act(0, raise(50)), act(1, raise(150))], 0)).toBe('foldToThreeBet');
  });

  it('has no spot for the big blind after a limp', () => {
    expect(spotOf([start(1), act(1, call)], 0)).toBeNull();
  });

  it('names the flop spots of the preflop raiser and its opponent', () => {
    const raised = [start(0), act(0, raise(50)), act(1, call), street('flop')];
    expect(spotOf([...raised, act(1, check)], 0)).toBe('cbet');
    const facing = [
      start(1),
      act(1, raise(50)),
      act(0, call),
      street('flop'),
      act(0, check),
      act(1, raise(30)),
    ];
    expect(spotOf(facing, 0)).toBe('foldToCbet');
  });

  it('names the turn and river spots', () => {
    const limped = [
      start(0),
      act(0, call),
      act(1, check),
      street('flop'),
      act(1, check),
      act(0, check),
    ];
    expect(spotOf([...limped, street('turn')], 1)).toBe('turnBet');
    const river = [...limped, street('turn'), act(1, check), act(0, check), street('river')];
    expect(spotOf(river, 1)).toBe('riverBet');
    expect(spotOf([...river, act(1, raise(40))], 0)).toBe('riverFold');
  });
});
