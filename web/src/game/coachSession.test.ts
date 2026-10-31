import { describe, expect, it } from 'vitest';
import type { Observation } from '../brains/index.ts';
import type { CoachFacts } from '../coach/index.ts';
import { TOURNAMENT } from '../engine/index.ts';
import type { LegalActions } from '../engine/index.ts';
import type { BotClient } from './botClient.ts';
import { memoryStore } from './records/store.ts';
import { createSession } from './session.ts';
import { callingBot } from './testBot.ts';

const FACTS: CoachFacts = {
  hint: null,
  strategy: null,
  range: null,
  combos: null,
  equity: 0.5,
  versus: 'random',
  odds: null,
  composition: null,
  outs: null,
  blockers: null,
};

interface Ask {
  observations: Observation[];
  legal: LegalActions;
  pot: number;
  resolve: (facts: CoachFacts) => void;
  reject: (error: Error) => void;
}

function coachingBot(): BotClient & { asks: Ask[] } {
  const asks: Ask[] = [];
  return {
    ...callingBot(),
    asks,
    coach: (observations, legal, pot) =>
      new Promise<CoachFacts>((resolve, reject) => {
        asks.push({ observations, legal, pot, resolve, reject });
      }),
  };
}

function open(bot: BotClient, coach = true) {
  return createSession({
    bot,
    seed: 7,
    botDelayMs: 0,
    humanSeat: 1,
    names: ['Mallorca', 'You'],
    mode: TOURNAMENT,
    coach,
  });
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('session coach', () => {
  it('asks at the player turn with the whole hand from the player seat', async () => {
    const bot = coachingBot();
    const session = open(bot);
    await session.getState().start();
    expect(session.getState().phase).toBe('humanToAct');
    expect(session.getState().coach.status).toBe('waiting');
    const ask = bot.asks[0];
    expect(ask?.observations[0]?.type).toBe('handStarted');
    const hole = ask?.observations.find((o) => o.type === 'holeCards');
    const human = session.getState().table.hand?.holeCards[1];
    expect(hole?.type === 'holeCards' && hole.cards).toEqual(human);
    expect(ask?.pot).toBe(session.getState().table.hand?.pot);
    ask?.resolve(FACTS);
    await flush();
    expect(session.getState().coach).toMatchObject({ status: 'ready', facts: FACTS });
  });

  it('asks when switched on mid-hand and stays off until then', async () => {
    const bot = coachingBot();
    const session = open(bot, false);
    await session.getState().start();
    expect(session.getState().coach.status).toBe('off');
    expect(bot.asks).toHaveLength(0);
    session.getState().setCoach(true);
    expect(bot.asks[0]?.observations[0]?.type).toBe('handStarted');
  });

  it('drops a reply that comes after the player acted', async () => {
    const bot = coachingBot();
    const session = open(bot);
    await session.getState().start();
    const first = bot.asks[0];
    await session.getState().act({ kind: 'passive' });
    first?.resolve(FACTS);
    await flush();
    expect(session.getState().coach.facts).toBeNull();
  });

  it('drops a reply after the coach is switched off', async () => {
    const bot = coachingBot();
    const session = open(bot);
    await session.getState().start();
    session.getState().setCoach(false);
    bot.asks[0]?.resolve(FACTS);
    await flush();
    expect(session.getState().coach).toMatchObject({ status: 'off', facts: null });
  });

  it('is unavailable without a coach or when it fails', async () => {
    const plain = open(callingBot());
    await plain.getState().start();
    expect(plain.getState().coach.status).toBe('unavailable');
    const bot = coachingBot();
    const session = open(bot);
    await session.getState().start();
    bot.asks[0]?.reject(new Error('worker down'));
    await flush();
    expect(session.getState().coach.status).toBe('unavailable');
  });

  it('clears the facts when a new hand starts', async () => {
    const bot = coachingBot();
    const session = open(bot);
    await session.getState().start();
    bot.asks[0]?.resolve(FACTS);
    await flush();
    while (session.getState().phase === 'humanToAct') {
      await session.getState().act({ kind: 'fold' });
    }
    expect(session.getState().phase).toBe('handOver');
    await session.getState().nextHand();
    expect(session.getState().coach.facts).toBeNull();
  });
});

const HINTED: CoachFacts = {
  ...FACTS,
  hint: {
    moves: [
      { label: 'fold', amount: 0, tone: 'fold' },
      { label: 'call', amount: 10, tone: 'passive' },
      { label: 'raise', amount: 60, tone: 'small' },
    ],
    mine: [0.02, 0.18, 0.8],
    approximate: false,
    heroCell: 0,
  },
};

async function ready(bot: ReturnType<typeof coachingBot>, index: number): Promise<void> {
  bot.asks[index]?.resolve(HINTED);
  await flush();
}

describe('session coach review', () => {
  it('grades the player action and keeps it for the hand and the session', async () => {
    const bot = coachingBot();
    const session = open(bot);
    await session.getState().start();
    await ready(bot, 0);
    const legal = bot.asks[0]?.legal;
    await session.getState().act({ kind: 'passive' });
    const { review, log } = session.getState().coach;
    expect(review).toHaveLength(1);
    expect(log).toHaveLength(1);
    const expected = legal?.call === null ? null : 1;
    expect(review[0]?.chosen).toBe(expected);
    expect(review[0]?.street).toBe('preflop');
  });

  it('does not grade an action taken without facts', async () => {
    const bot = coachingBot();
    const session = open(bot);
    await session.getState().start();
    await session.getState().act({ kind: 'passive' });
    expect(session.getState().coach.review).toHaveLength(0);
  });

  it('clears the hand review at the next hand and keeps the session log', async () => {
    const bot = coachingBot();
    const session = open(bot);
    await session.getState().start();
    await ready(bot, 0);
    while (session.getState().phase === 'humanToAct') {
      await session.getState().act({ kind: 'fold' });
    }
    expect(session.getState().coach.review.length).toBeGreaterThan(0);
    await session.getState().nextHand();
    expect(session.getState().coach.review).toHaveLength(0);
    expect(session.getState().coach.log.length).toBeGreaterThan(0);
  });

  it('stores the coached decisions in the hand record with the acted event index', async () => {
    const bot = coachingBot();
    const store = memoryStore();
    const session = createSession({
      bot,
      seed: 7,
      botDelayMs: 0,
      humanSeat: 1,
      names: ['Mallorca', 'You'],
      mode: TOURNAMENT,
      coach: true,
      records: { store, sessionId: 's', now: () => '2026-10-31T00:00:00.000Z' },
    });
    await session.getState().start();
    await ready(bot, 0);
    while (session.getState().phase === 'humanToAct') {
      await session.getState().act({ kind: 'fold' });
    }
    const [record] = await store.list('s');
    const coached = record?.coach?.[0];
    expect(coached).toBeDefined();
    const event = record?.events[coached?.eventIndex ?? -1];
    expect(event?.type === 'acted' && event.seat).toBe(1);
    await session.getState().nextHand();
    while (session.getState().phase === 'humanToAct') {
      await session.getState().act({ kind: 'fold' });
    }
    const second = (await store.list('s'))[1];
    expect(second === undefined || second.coach === undefined).toBe(true);
  });
});
