import { describe, expect, it } from 'vitest';
import type { Observation } from '../brains/index.ts';
import type { CoachFacts } from '../coach/index.ts';
import { TOURNAMENT } from '../engine/index.ts';
import type { LegalActions } from '../engine/index.ts';
import type { BotClient } from './botClient.ts';
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
    expect(session.getState().coach).toEqual({ status: 'ready', facts: FACTS });
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
    expect(session.getState().coach).toEqual({ status: 'off', facts: null });
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
