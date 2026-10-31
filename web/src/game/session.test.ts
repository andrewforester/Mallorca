import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Decision } from '../brains/index.ts';
import { CASH, legalActionsOf, toAct, TOURNAMENT } from '../engine/index.ts';
import type { TableMode } from '../engine/index.ts';
import type { BotClient } from './botClient.ts';
import { inProcessBot } from './botClient.ts';
import { memoryStore } from './records/store.ts';
import type { HandStore } from './records/store.ts';
import { createSession } from './session.ts';
import type { Session } from './session.ts';
import type { Opponent } from './opponent.ts';
import { callingBot, scriptedBot, shovingBot } from './testBot.ts';

function open(
  bot: BotClient,
  overrides: {
    botDelayMs?: number;
    seed?: number;
    startingStacks?: [number, number];
    mode?: TableMode;
  } = {},
): Session {
  return createSession({
    bot,
    seed: overrides.seed ?? 7,
    botDelayMs: overrides.botDelayMs ?? 0,
    humanSeat: 1,
    names: ['Mallorca', 'You'],
    startingStacks: overrides.startingStacks,
    mode: overrides.mode ?? TOURNAMENT,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

function callsThenFolds(): BotClient {
  let decisions = 0;
  return scriptedBot((legal) => {
    decisions += 1;
    if (decisions === 1 || !legal.fold) {
      return legal.check ? { kind: 'check' } : { kind: 'call' };
    }
    return { kind: 'fold' };
  });
}

describe('session', () => {
  it('starts idle', () => {
    const session = open(inProcessBot());
    expect(session.getState().phase).toBe('idle');
  });

  it('deals hand 1 and waits for the human after the bot acts first', async () => {
    const bot = callingBot();
    const session = open(bot);
    await session.getState().start();
    const state = session.getState();
    expect(state.phase).toBe('humanToAct');
    expect(state.table.handNumber).toBe(1);
    expect(toAct(state.table)).toBe(1);
    expect(bot.decideCalls).toBe(1);
    expect(state.log.length).toBeGreaterThan(0);
    expect(state.lastActions[0]).toEqual({ key: 'call', params: { amount: 10 } });
  });

  it('deals the same cards for the same seed', async () => {
    const first = open(callingBot(), { seed: 11 });
    const second = open(callingBot(), { seed: 11 });
    const other = open(callingBot(), { seed: 12 });
    await Promise.all([
      first.getState().start(),
      second.getState().start(),
      other.getState().start(),
    ]);
    expect(first.getState().table.hand?.holeCards).toEqual(second.getState().table.hand?.holeCards);
    expect(first.getState().table.hand?.holeCards).not.toEqual(
      other.getState().table.hand?.holeCards,
    );
  });

  it('clamps a raise below the minimum to the minimum', async () => {
    const session = open(callsThenFolds());
    await session.getState().start();
    const legal = legalActionsOf(session.getState().table);
    await session.getState().act({ kind: 'raise', to: 1 });
    expect(session.getState().lastActions[1]).toEqual({
      key: 'raiseTo',
      params: { amount: legal.raise?.min },
    });
  });

  it('rounds a fractional raise and clamps it to the maximum', async () => {
    const first = open(callsThenFolds());
    await first.getState().start();
    const legal = legalActionsOf(first.getState().table);
    const target = (legal.raise?.min ?? 0) + 10.6;
    await first.getState().act({ kind: 'raise', to: target });
    expect(first.getState().lastActions[1]).toEqual({
      key: 'raiseTo',
      params: { amount: Math.round(target) },
    });

    const second = open(callsThenFolds());
    await second.getState().start();
    await second.getState().act({ kind: 'raise', to: 999999 });
    expect(second.getState().lastActions[1]).toEqual({ key: 'allIn', params: {} });
  });

  it('clears the last actions when a street is dealt', async () => {
    const session = open(callingBot());
    await session.getState().start();
    expect(session.getState().lastActions[0]).not.toBeNull();
    await session.getState().act({ kind: 'passive' });
    expect(session.getState().table.hand?.street).toBe('flop');
    expect(session.getState().lastActions).toEqual([null, null]);
  });

  it('keeps the actions that closed a street when the next one is dealt', async () => {
    const session = open(callingBot());
    await session.getState().start();
    await session.getState().act({ kind: 'passive' });
    expect(session.getState().table.hand?.street).toBe('flop');
    await session.getState().act({ kind: 'raise', to: 80 });
    const state = session.getState();
    expect(state.table.hand?.street).toBe('turn');
    expect(state.lastActions).toEqual([null, null]);
    expect(state.closingActions).toEqual([
      { key: 'call', params: { amount: 80 } },
      { key: 'bet', params: { amount: 80 } },
    ]);
  });

  it('forgets the closing actions when a new hand starts', async () => {
    const session = open(callsThenFolds());
    await session.getState().start();
    await session.getState().act({ kind: 'passive' });
    expect(session.getState().closingActions[0]).not.toBeNull();
    await session.getState().act({ kind: 'raise', to: 40 });
    expect(session.getState().phase).toBe('handOver');
    await session.getState().nextHand();
    expect(session.getState().closingActions).toEqual([null, null]);
  });

  it('labels a raise that opens the flop as a bet', async () => {
    const session = open(callsThenFolds());
    await session.getState().start();
    await session.getState().act({ kind: 'passive' });
    expect(session.getState().table.hand?.street).toBe('flop');
    await session.getState().act({ kind: 'raise', to: 40 });
    const state = session.getState();
    expect(state.lastActions[1]).toEqual({ key: 'bet', params: { amount: 40 } });
    expect(state.log.find((entry) => entry.key === 'bet')).toEqual({
      key: 'bet',
      params: { seat: 1, amount: 40 },
    });
  });

  it('turns a fold into a check when checking is free', async () => {
    const session = open(callingBot());
    await session.getState().start();
    await session.getState().act({ kind: 'fold' });
    expect(session.getState().log).toContainEqual({ key: 'check', params: { seat: 1 } });
    expect(session.getState().table.hand?.street).toBe('flop');
  });

  it('ignores act while the bot is thinking', async () => {
    let release: (d: Decision) => void = () => undefined;
    let calls = 0;
    const pending: BotClient = {
      observe: () => undefined,
      reset: () => undefined,
      decide: () => {
        calls += 1;
        return new Promise<Decision>((resolve) => {
          release = resolve;
        });
      },
    };
    const session = open(pending);
    const started = session.getState().start();
    expect(session.getState().phase).toBe('botThinking');
    const before = session.getState().log.length;
    await session.getState().act({ kind: 'passive' });
    expect(session.getState().log.length).toBe(before);
    expect(session.getState().phase).toBe('botThinking');
    release({
      action: { kind: 'call' },
      solverChoice: 'passive',
      evByAction: { fold: 0, passive: 0, aggressive: 0 },
    });
    await started;
    expect(session.getState().phase).toBe('humanToAct');
    expect(calls).toBe(1);
  });

  it('falls back to an in-process bot once when decide rejects', async () => {
    let calls = 0;
    const broken: BotClient = {
      observe: () => undefined,
      reset: () => undefined,
      decide: () => {
        calls += 1;
        return Promise.reject(new Error('worker crashed'));
      },
    };
    const session = open(broken);
    await session.getState().start();
    expect(['humanToAct', 'handOver']).toContain(session.getState().phase);
    expect(session.getState().lastActions[0]).not.toBeNull();
    expect(session.getState().lastDecision).not.toBeNull();
    while (session.getState().phase === 'humanToAct') {
      await session.getState().act({ kind: 'passive' });
    }
    expect(calls).toBe(1);
    expect(['handOver', 'tournamentOver']).toContain(session.getState().phase);
  });

  it('falls back after a timeout when decide never resolves', async () => {
    vi.useFakeTimers();
    const silent: BotClient = {
      observe: () => undefined,
      reset: () => undefined,
      decide: () => new Promise<Decision>(() => undefined),
    };
    const session = open(silent);
    const started = session.getState().start();
    await vi.advanceTimersByTimeAsync(4999);
    expect(session.getState().phase).toBe('botThinking');
    await vi.advanceTimersByTimeAsync(1);
    await started;
    expect(['humanToAct', 'handOver']).toContain(session.getState().phase);
    expect(session.getState().lastDecision).not.toBeNull();
  });

  it('waits botDelayMs before the bot acts', async () => {
    vi.useFakeTimers();
    const session = open(callingBot(), { botDelayMs: 700 });
    const started = session.getState().start();
    await vi.advanceTimersByTimeAsync(699);
    expect(session.getState().phase).toBe('animating');
    expect(session.getState().lastActions[0]).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await started;
    expect(session.getState().phase).toBe('humanToAct');
    expect(session.getState().lastActions[0]).toEqual({ key: 'call', params: { amount: 10 } });
  });

  it('keeps the last bot decision', async () => {
    const session = open(callingBot());
    expect(session.getState().lastDecision).toBeNull();
    await session.getState().start();
    expect(session.getState().lastDecision?.action).toEqual({ kind: 'call' });
  });

  it('ends the hand when a player folds and starts the next on request', async () => {
    const session = open(shovingBot());
    await session.getState().start();
    await session.getState().act({ kind: 'fold' });
    const state = session.getState();
    expect(['handOver', 'tournamentOver']).toContain(state.phase);
    expect(state.result).not.toBeNull();
    if (state.phase === 'handOver') {
      await state.nextHand();
      expect(session.getState().table.handNumber).toBe(2);
    }
  });

  it('reports the same pot in the result and the log when a raise is folded to', async () => {
    const session = open(
      scriptedBot((legal) => (legal.raise ? { kind: 'raise', to: 60 } : { kind: 'call' })),
    );
    await session.getState().start();
    await session.getState().act({ kind: 'fold' });
    const state = session.getState();
    expect(state.result).toMatchObject({ winner: 0, showdown: false, amount: 40 });
    expect(state.log.slice(-2)).toEqual([
      { key: 'returned', params: { seat: 0, amount: 40 } },
      { key: 'win', params: { seat: 0, amount: state.result?.amount } },
    ]);
  });

  it('ends the tournament when the deal busts the short stack', async () => {
    const bot = callingBot();
    const session = open(bot, { seed: 1, startingStacks: [3990, 10] });
    await session.getState().start();
    const state = session.getState();
    expect(state.phase).toBe('tournamentOver');
    expect(state.table.winner).toBe(0);
    expect(state.result).toMatchObject({ winner: 0, showdown: true, amount: 20 });
    expect(bot.decideCalls).toBe(0);
  });

  it('shows the result of a hand that ends at the deal and deals the next one', async () => {
    const session = open(callingBot(), { seed: 2, startingStacks: [3990, 10] });
    await session.getState().start();
    const state = session.getState();
    expect(state.phase).toBe('handOver');
    expect(state.result).toMatchObject({ winner: 1, showdown: true, amount: 20 });
    expect(state.table.seats.map((s) => s.stack)).toEqual([3980, 20]);
    await state.nextHand();
    expect(session.getState().table.handNumber).toBe(2);
  });

  it('plays the tournament to the end when the human always folds', async () => {
    const session = open(shovingBot());
    await session.getState().start();
    for (let i = 0; i < 4000 && session.getState().phase !== 'tournamentOver'; i += 1) {
      const { phase } = session.getState();
      if (phase === 'humanToAct') {
        await session.getState().act({ kind: 'fold' });
      } else if (phase === 'handOver') {
        await session.getState().nextHand();
      }
    }
    const state = session.getState();
    expect(state.phase).toBe('tournamentOver');
    expect(state.table.winner).toBe(0);
  });

  it('plays a hand against the real brain', async () => {
    const session = open(inProcessBot());
    await session.getState().start();
    for (let i = 0; i < 40 && session.getState().phase === 'humanToAct'; i += 1) {
      await session.getState().act({ kind: 'passive' });
    }
    expect(['handOver', 'tournamentOver']).toContain(session.getState().phase);
  });

  it('restarts cleanly', async () => {
    const session = open(
      scriptedBot((legal) => (legal.check ? { kind: 'check' } : { kind: 'call' })),
    );
    await session.getState().start();
    await session.getState().act({ kind: 'passive' });
    await session.getState().start();
    expect(session.getState().table.handNumber).toBe(1);
    expect(session.getState().phase).toBe('humanToAct');
  });

  it('drops a pending bot decision when start is called again', async () => {
    const releases: ((d: Decision) => void)[] = [];
    const bot: BotClient = {
      observe: () => undefined,
      reset: () => undefined,
      decide: () =>
        new Promise<Decision>((resolve) => {
          releases.push(resolve);
        }),
    };
    const session = open(bot);
    const first = session.getState().start();
    const second = session.getState().start();
    await vi.waitFor(() => {
      expect(releases).toHaveLength(2);
    });
    const stale = {
      action: { kind: 'raise', to: 100 },
      solverChoice: 'aggressive',
      evByAction: { fold: 0, passive: 0, aggressive: 0 },
    } as const;
    releases[0]?.(stale);
    await first;
    expect(session.getState().lastActions[0]).toBeNull();
    expect(session.getState().log.some((entry) => entry.key === 'raise')).toBe(false);
    releases[1]?.({ ...stale, action: { kind: 'call' } });
    await second;
    expect(session.getState().lastActions[0]).toEqual({ key: 'call', params: { amount: 10 } });
  });

  it('does not fire a pending bot delay after dispose', async () => {
    vi.useFakeTimers();
    const session = open(callingBot(), { botDelayMs: 700 });
    const started = session.getState().start();
    await vi.advanceTimersByTimeAsync(100);
    session.getState().dispose();
    await started;
    await vi.advanceTimersByTimeAsync(5000);
    expect(session.getState().lastActions[0]).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not fire a pending bot delay after a restart', async () => {
    vi.useFakeTimers();
    const bot = callingBot();
    const session = open(bot, { botDelayMs: 700 });
    const first = session.getState().start();
    await vi.advanceTimersByTimeAsync(100);
    const second = session.getState().start();
    await first;
    await vi.advanceTimersByTimeAsync(699);
    expect(session.getState().lastActions[0]).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(session.getState().lastActions[0]).toEqual({ key: 'call', params: { amount: 10 } });
    expect(session.getState().log.filter((entry) => entry.key === 'handStarted').length).toBe(1);
  });

  it('disposes the bot client', () => {
    const dispose = vi.fn();
    const bot = { ...callingBot(), dispose };
    open(bot).getState().dispose();
    expect(dispose).toHaveBeenCalled();
  });
});

const SEED = 2;
const LOSING_SEED = 4;

describe('cash session', () => {
  it('tracks hands and net without topping the human up when only the bot busts', async () => {
    const session = open(shovingBot(), {
      mode: CASH,
      seed: SEED,
      startingStacks: [2000, 3400],
    });
    expect(session.getState().session).toEqual({ hands: 0, net: 1400 });
    await session.getState().start();
    await session.getState().act({ kind: 'fold' });
    expect(session.getState().phase).toBe('handOver');
    const afterFirst = session.getState();
    expect(afterFirst.session.hands).toBe(1);
    await afterFirst.nextHand();
    await session.getState().act({ kind: 'raise', to: 99999 });
    const state = session.getState();
    expect(state.phase).toBe('handOver');
    expect(state.table.seats[0].stack).toBe(0);
    expect(state.table.seats[1].stack).toBeGreaterThan(3400);
    expect(state.session).toEqual({ hands: 2, net: state.table.seats[1].stack - 2000 });
    expect(state.session.net).toBeGreaterThan(1400);
    await state.nextHand();
    const next = session.getState();
    expect(next.table.seats[1].stack + (next.table.hand?.bets[1] ?? 0)).toBeGreaterThan(3400);
    expect(next.table.seats[0].stack + (next.table.hand?.bets[0] ?? 0)).toBe(2000);
    expect(next.session.net).toBe(state.session.net);
  });

  it('keeps playing after the human loses everything', async () => {
    const session = open(shovingBot(), { mode: CASH, seed: LOSING_SEED });
    await session.getState().start();
    await session.getState().act({ kind: 'raise', to: 99999 });
    const over = session.getState();
    expect(over.phase).toBe('handOver');
    expect(over.table.seats[1].stack).toBe(0);
    expect(over.table.winner).toBeNull();
    expect(over.session).toEqual({ hands: 1, net: -2000 });
    await over.nextHand();
    const state = session.getState();
    expect(state.table.seats[1].stack + (state.table.hand?.bets[1] ?? 0)).toBe(2000);
    expect(state.session.net).toBe(-2000);
    expect(state.session.hands).toBe(1);
  });

  it('keeps net constant during a hand and changes it only when the hand completes', async () => {
    const session = open(callingBot(), { mode: CASH });
    await session.getState().start();
    const seen: number[] = [session.getState().session.net];
    await session.getState().act({ kind: 'raise', to: 100 });
    seen.push(session.getState().session.net);
    expect(session.getState().phase).not.toBe('handOver');
    expect(new Set(seen)).toEqual(new Set([0]));
    while (session.getState().phase === 'humanToAct') {
      await session.getState().act({ kind: 'passive' });
    }
    expect(session.getState().phase).toBe('handOver');
    const { table, session: tallied } = session.getState();
    expect(tallied.net).toBe(table.seats[1].stack - 2000);
  });

  it('leaves only between hands', async () => {
    const session = open(callingBot(), { mode: CASH });
    await session.getState().start();
    session.getState().leave();
    expect(session.getState().phase).toBe('humanToAct');
    await session.getState().act({ kind: 'fold' });
    await session.getState().act({ kind: 'fold' });
    while (session.getState().phase === 'humanToAct') {
      await session.getState().act({ kind: 'passive' });
    }
    expect(session.getState().phase).toBe('handOver');
    session.getState().leave();
    expect(session.getState().phase).toBe('sessionOver');
    const log = session.getState().log.length;
    await session.getState().act({ kind: 'passive' });
    await session.getState().nextHand();
    expect(session.getState().phase).toBe('sessionOver');
    expect(session.getState().log.length).toBe(log);
  });

  it('ignores leave in a tournament', async () => {
    const session = open(shovingBot(), { mode: TOURNAMENT });
    await session.getState().start();
    await session.getState().act({ kind: 'fold' });
    const { phase } = session.getState();
    session.getState().leave();
    expect(session.getState().phase).toBe(phase);
  });

  it('switches mode with start(mode)', async () => {
    const session = open(callingBot());
    await session.getState().start(CASH);
    expect(session.getState().table.mode).toEqual(CASH);
    await session.getState().start();
    expect(session.getState().table.mode).toEqual(CASH);
    await session.getState().start(TOURNAMENT);
    expect(session.getState().table.mode).toEqual(TOURNAMENT);
  });
});

describe('session recording', () => {
  const now = () => '2026-10-23T18:00:00.000Z';

  function record(store: HandStore, bot: BotClient): Session {
    return createSession({
      bot,
      seed: 7,
      botDelayMs: 0,
      humanSeat: 1,
      names: ['Mallorca', 'You'],
      mode: CASH,
      records: { store, sessionId: 's1', now },
    });
  }

  it('stores a record per hand with the bot decisions pointing at its acted events', async () => {
    const store = memoryStore();
    const session = record(store, shovingBot());
    await session.getState().start();
    expect(session.getState().sessionId).toBe('s1');
    await session.getState().act({ kind: 'fold' });
    await session.getState().nextHand();
    await session.getState().act({ kind: 'fold' });
    const records = await store.list();
    expect(records.map((r) => r.id)).toEqual(['s1-1', 's1-2']);
    expect(records[0]?.playedAt).toBe(now());
    expect(records[0]?.humanSeat).toBe(1);
    expect(records[0]?.bot).toEqual({ id: 'math', version: '1' });
    expect(records[0]?.decisions.length).toBeGreaterThan(0);
    for (const rec of records) {
      for (const decision of rec.decisions) {
        const event = rec.events[decision.eventIndex];
        expect(event?.type).toBe('acted');
        expect(event?.type === 'acted' && event.seat).toBe(0);
      }
    }
  });

  it('keeps dealing when the store rejects', async () => {
    const store: HandStore = {
      add: () => Promise.reject(new Error('quota')),
      list: () => Promise.resolve([]),
      clear: () => Promise.resolve(),
    };
    const session = record(store, shovingBot());
    await session.getState().start();
    await session.getState().act({ kind: 'fold' });
    await session.getState().nextHand();
    expect(session.getState().table.handNumber).toBe(2);
    expect(session.getState().phase).toBe('humanToAct');
  });

  it('keeps dealing when the clock throws while recording', async () => {
    const store = memoryStore();
    const session = createSession({
      bot: shovingBot(),
      seed: 7,
      botDelayMs: 0,
      humanSeat: 1,
      names: ['Mallorca', 'You'],
      mode: CASH,
      records: {
        store,
        sessionId: 's1',
        now: () => {
          throw new Error('clock');
        },
      },
    });
    await session.getState().start();
    await session.getState().act({ kind: 'fold' });
    expect(session.getState().phase).toBe('handOver');
    expect(session.getState().result).not.toBeNull();
    await session.getState().nextHand();
    expect(session.getState().table.handNumber).toBe(2);
    expect(session.getState().phase).toBe('humanToAct');
    expect(await store.list()).toEqual([]);
  });

  it('records nothing without records', async () => {
    const session = open(shovingBot());
    await session.getState().start();
    expect(session.getState().sessionId).toBeNull();
  });
});

describe('session opponent', () => {
  function selecting(answer: (opponent: Opponent) => Promise<Opponent>) {
    const bot = shovingBot();
    const asked: [Opponent, number][] = [];
    bot.select = (opponent, seed) => {
      asked.push([opponent, seed]);
      return answer(opponent);
    };
    return { bot, asked };
  }

  it('plays the math bot by default without asking', async () => {
    const { bot, asked } = selecting((o) => Promise.resolve(o));
    const session = open(bot);
    await session.getState().start(CASH);
    expect(session.getState().opponent).toBe('math');
    expect(asked).toEqual([]);
  });

  it('asks again only when the opponent changes', async () => {
    const { bot, asked } = selecting((o) => Promise.resolve(o));
    const session = open(bot);
    await session.getState().start(CASH, 'cfr');
    await session.getState().start(CASH);
    await session.getState().start(CASH, 'cfr');
    await session.getState().start(CASH, 'math');
    expect(asked).toEqual([
      ['cfr', 7],
      ['math', 7],
    ]);
  });

  it('asks the bot for the chosen opponent before the first hand', async () => {
    const { bot, asked } = selecting((o) => Promise.resolve(o));
    const store = memoryStore();
    const session = createSession({
      bot,
      seed: 7,
      botDelayMs: 0,
      humanSeat: 1,
      names: ['Mallorca', 'You'],
      mode: CASH,
      records: { store, sessionId: 's1', now: () => '2026-10-24T18:00:00.000Z' },
    });
    await session.getState().start(CASH, 'cfr');
    expect(asked).toEqual([['cfr', 7]]);
    expect(session.getState().opponent).toBe('cfr');
    await session.getState().act({ kind: 'fold' });
    const records = await store.list();
    expect(records[0]?.bot).toEqual({ id: 'cfr', version: 'v1-18' });
  });

  it('shows the math bot when the chosen opponent could not load', async () => {
    const { bot } = selecting(() => Promise.resolve('math'));
    const session = open(bot);
    await session.getState().start(CASH, 'cfr');
    expect(session.getState().opponent).toBe('math');
    expect(session.getState().phase).toBe('humanToAct');
  });
});
