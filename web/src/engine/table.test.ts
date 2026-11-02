import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../cards/index.ts';
import {
  apply,
  BIG_BLINDS,
  blindsFor,
  CASH,
  createTable,
  legalActionsOf,
  startHand,
  startingStack,
  toAct,
  TOURNAMENT,
  TOURNAMENT_STACK,
} from './table.ts';
import type { Table } from './table.ts';
import type { EngineEvent } from './types.ts';

function shoveHand(t: Table): { state: Table; events: EngineEvent[] } {
  let state = t;
  const events: EngineEvent[] = [];
  while (toAct(state) !== null) {
    const legal = legalActionsOf(state);
    const action = legal.raise
      ? ({ kind: 'raise', to: legal.raise.max } as const)
      : { kind: 'call' as const };
    const step = apply(state, action);
    state = step.state;
    events.push(...step.events);
  }
  return { state, events };
}

describe('blindsFor', () => {
  it('follows the schedule and holds the last level', () => {
    expect(blindsFor(1)).toEqual({ small: 10, big: 20 });
    expect(blindsFor(10)).toEqual({ small: 10, big: 20 });
    expect(blindsFor(11)).toEqual({ small: 15, big: 30 });
    expect(blindsFor(500)).toEqual({ small: 1200, big: 2400 });
    expect(BIG_BLINDS).toHaveLength(21);
  });

  it('changes level exactly after every tenth hand', () => {
    expect(blindsFor(0)).toEqual({ small: 10, big: 20 });
    expect(blindsFor(20)).toEqual({ small: 15, big: 30 });
    expect(blindsFor(21)).toEqual({ small: 20, big: 40 });
    expect(blindsFor(200)).toEqual({ small: 1000, big: 2000 });
    expect(blindsFor(201)).toEqual({ small: 1200, big: 2400 });
  });
});

describe('startingStack', () => {
  it('is the tournament stack in a tournament and the buy-in at a cash table', () => {
    expect(startingStack(TOURNAMENT)).toBe(TOURNAMENT_STACK);
    expect(startingStack(CASH)).toBe(2000);
    expect(startingStack({ kind: 'cash', bigBlind: 50, buyIn: 5000 })).toBe(5000);
  });
});

function shortStack(): Table {
  return {
    mode: TOURNAMENT,
    seats: [
      { name: 'Mallorca', stack: 3990 },
      { name: 'You', stack: 10 },
    ],
    button: 1,
    handNumber: 0,
    hand: null,
    winner: null,
  };
}

describe('table', () => {
  it('creates a tournament table with equal stacks and no hand', () => {
    const t = createTable(['Mallorca', 'You'], TOURNAMENT);
    expect(t.seats).toEqual([
      { name: 'Mallorca', stack: 2000 },
      { name: 'You', stack: 2000 },
    ]);
    expect(t).toMatchObject({
      mode: TOURNAMENT,
      button: 0,
      handNumber: 0,
      hand: null,
      winner: null,
    });
    expect(toAct(t)).toBeNull();
    expect(legalActionsOf(t)).toEqual({ fold: false, check: false, call: null, raise: null });
  });

  it('creates a cash table with the buy-in on both seats', () => {
    const t = createTable(['A', 'B'], CASH);
    expect(t.mode).toEqual({ kind: 'cash', bigBlind: 20, buyIn: 2000 });
    expect(t.seats.map((s) => s.stack)).toEqual([2000, 2000]);
  });

  it('uses the first button on hand one and alternates afterwards', () => {
    const rng = mulberry32(1);
    let t = createTable(['Mallorca', 'You'], TOURNAMENT, 1);
    const buttons: number[] = [];
    for (let i = 0; i < 3; i++) {
      const started = startHand(t, rng);
      buttons.push(started.state.button);
      expect(started.state.handNumber).toBe(i + 1);
      expect(started.events[0]).toMatchObject({ type: 'handStarted', handNumber: i + 1 });
      t = apply(started.state, { kind: 'fold' }).state;
    }
    expect(buttons).toEqual([1, 0, 1]);
  });

  it('plays all-in hands until one stack is empty and keeps the chip total', () => {
    const rng = mulberry32(3);
    let t = createTable(['Mallorca', 'You'], TOURNAMENT);
    let ended: EngineEvent[] = [];
    for (let i = 0; i < 500 && t.winner === null; i++) {
      const started = startHand(t, rng);
      const played = shoveHand(started.state);
      t = played.state;
      ended = played.events.filter((e) => e.type === 'tournamentEnded');
      expect(t.seats[0].stack + t.seats[1].stack).toBe(4000);
    }
    expect(t.winner).not.toBeNull();
    expect(ended).toEqual([{ type: 'tournamentEnded', winner: t.winner }]);
    expect(t.seats[t.winner as 0 | 1].stack).toBe(4000);
  });

  it('ends the tournament when the deal itself busts a player', () => {
    const started = startHand(shortStack(), mulberry32(2));
    expect(started.state.hand?.street).toBe('complete');
    expect(started.state.seats.map((s) => s.stack)).toEqual([4000, 0]);
    expect(started.state.winner).toBe(0);
    expect(started.events.at(-1)).toEqual({ type: 'tournamentEnded', winner: 0 });
    expect(toAct(started.state)).toBeNull();
    expect(() => startHand(started.state, mulberry32(2))).toThrow('The tournament is over');
  });

  it('completes a hand that ends at the deal without busting anyone', () => {
    const started = startHand(shortStack(), mulberry32(1));
    expect(started.state.hand?.street).toBe('complete');
    expect(started.state.seats.map((s) => s.stack)).toEqual([3980, 20]);
    expect(started.state.winner).toBeNull();
    expect(started.events.map((e) => e.type)).not.toContain('tournamentEnded');
    const next = startHand(started.state, mulberry32(1));
    expect(next.state.handNumber).toBe(2);
  });

  it('refuses to start a hand while one is in progress', () => {
    const started = startHand(createTable(['Mallorca', 'You'], TOURNAMENT), mulberry32(1));
    expect(() => startHand(started.state, mulberry32(1))).toThrow('A hand is still in progress');
  });

  it('raises the blinds on hand eleven', () => {
    const rng = mulberry32(1);
    let t = createTable(['Mallorca', 'You'], TOURNAMENT);
    const bigBlinds: number[] = [];
    for (let i = 0; i < 11; i++) {
      const started = startHand(t, rng);
      const handStarted = started.events[0] as Extract<EngineEvent, { type: 'handStarted' }>;
      bigBlinds.push(handStarted.bigBlind);
      t = apply(started.state, { kind: 'fold' }).state;
    }
    expect(bigBlinds.slice(9)).toEqual([20, 30]);
  });

  it('refuses to start a hand once the tournament is over', () => {
    const rng = mulberry32(3);
    let t = createTable(['Mallorca', 'You'], TOURNAMENT);
    while (t.winner === null) {
      t = shoveHand(startHand(t, rng).state).state;
    }
    expect(() => startHand(t, rng)).toThrow();
  });

  it('keeps a cash session going after a bust and tops the seat up on the next hand', () => {
    const rng = mulberry32(3);
    let t = createTable(['Mallorca', 'You'], CASH);
    let events: EngineEvent[] = [];
    for (let i = 0; i < 500 && !t.seats.some((s) => s.stack === 0); i++) {
      const played = shoveHand(startHand(t, rng).state);
      t = played.state;
      events = played.events;
    }
    const busted = t.seats[0].stack === 0 ? 0 : 1;
    expect(t.seats[busted].stack).toBe(0);
    expect(t.winner).toBeNull();
    expect(events.map((e) => e.type)).not.toContain('tournamentEnded');
    const next = startHand(t, rng);
    const types = next.events.map((e) => e.type);
    expect(types[0]).toBe('toppedUp');
    expect(types.indexOf('toppedUp')).toBeLessThan(types.indexOf('handStarted'));
    expect(next.events[0]).toEqual({ type: 'toppedUp', seat: busted, amount: 2000 });
    const handStarted = next.events.find((e) => e.type === 'handStarted') as Extract<
      EngineEvent,
      { type: 'handStarted' }
    >;
    expect(handStarted.stacks[busted]).toBe(2000);
  });
});
