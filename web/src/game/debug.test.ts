import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BotBias, Breakdown } from '../brains/index.ts';
import { CASH } from '../engine/index.ts';
import type { LegalActions } from '../engine/index.ts';
import { PERSONALITIES } from '../persona/index.ts';
import { createSession } from './session.ts';
import type { Session } from './session.ts';
import type { SessionOptions } from './sessionTypes.ts';
import { callingBot } from './testBot.ts';
import type { ScriptedBot } from './testBot.ts';

interface ExplainingBot extends ScriptedBot {
  asked: (boolean | undefined)[];
  biases: (BotBias | undefined)[];
}

const breakdown: Breakdown = {
  moves: [{ kind: 'fold' }, { kind: 'call' }],
  base: [0.4, 0.6],
  biased: [0.3, 0.7],
  chosen: 1,
};

function explainingBot(): ExplainingBot {
  const inner = callingBot();
  const bot: ExplainingBot = {
    ...inner,
    asked: [],
    biases: [],
    select: (opponent) => Promise.resolve(opponent),
    decide: async (legal: LegalActions, bias?: BotBias, explain?: boolean) => {
      bot.asked.push(explain);
      bot.biases.push(bias);
      const decision = await inner.decide(legal);
      return explain === true ? { ...decision, breakdown } : decision;
    },
  };
  return bot;
}

function open(extra: Partial<SessionOptions> = {}): { session: Session; bot: ExplainingBot } {
  const bot = explainingBot();
  const session = createSession({
    bot,
    seed: 11,
    botDelayMs: 0,
    humanSeat: 0,
    names: ['You', 'Mallorca'],
    mode: CASH,
    now: () => 0,
    ...extra,
  });
  return { session, bot };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the emotion debug state', () => {
  it('is null and asks for no explanation without the option', async () => {
    const { session, bot } = open();
    await session.getState().start(CASH, 'cfr');
    await session.getState().act({ kind: 'passive' });
    expect(session.getState().debug).toBeNull();
    expect(bot.asked.length).toBeGreaterThan(0);
    expect(bot.asked.every((a) => a !== true)).toBe(true);
  });

  it('is null outside a development build', async () => {
    vi.stubEnv('DEV', false);
    const { session, bot } = open({ debug: true });
    await session.getState().start(CASH, 'cfr');
    await session.getState().act({ kind: 'passive' });
    expect(session.getState().debug).toBeNull();
    expect(bot.asked.every((a) => a !== true)).toBe(true);
  });

  it('follows her feeling and explains every decision', async () => {
    const { session, bot } = open({ debug: true });
    await session.getState().start(CASH, 'cfr');
    await session.getState().act({ kind: 'passive' });
    const debug = session.getState().debug;
    expect(debug?.personality).toEqual({ key: 'mallorca' });
    expect(debug?.snapshot?.traits.composure).toBeGreaterThan(0);
    expect(debug?.journal.some((e) => e.event.kind === 'deal')).toBe(true);
    expect(bot.asked.every((a) => a === true)).toBe(true);
    expect(debug?.sentBias).toEqual(bot.biases.at(-1));
    const table = session.getState().table;
    expect(debug?.decision?.rows.map((r) => [r.move.label, r.base, r.biased, r.chosen])).toEqual([
      ['fold', 0.4, 0.3, false],
      ['call', 0.6, 0.7, true],
    ]);
    expect(debug?.decision?.hand).toEqual(table.hand?.holeCards[1]);
    expect(debug?.decision?.action.label).toMatch(/check|call/);
  });

  it('switches her personality for this and later sessions', async () => {
    const { session } = open({ debug: true });
    await session.getState().start(CASH, 'cfr');
    const mallorca = session.getState().debug?.snapshot?.traits;
    session.getState().setPersonality('lola');
    const lola = session.getState().debug?.snapshot?.traits;
    expect(session.getState().debug?.personality).toEqual({ key: 'lola' });
    expect(lola?.composure).toBeLessThan(mallorca?.composure ?? 0);
    await session.getState().start();
    expect(session.getState().debug?.snapshot?.traits).toEqual(lola);
    const custom = { ...PERSONALITIES.nina, suppression: 1 };
    session.getState().setPersonality(custom);
    expect(session.getState().debug?.personality).toEqual({ key: 'custom', personality: custom });
  });

  it('starts her feeling over', async () => {
    const { session } = open({ debug: true });
    await session.getState().start(CASH, 'cfr');
    expect(session.getState().debug?.journal.length).toBeGreaterThan(0);
    session.getState().resetFeeling();
    expect(session.getState().debug?.journal).toEqual([]);
    expect(session.getState().debug?.snapshot?.sessionNetBb).toBe(0);
  });

  it('follows her feeling but sends no bias against the math bot', async () => {
    const { session, bot } = open({ debug: true });
    await session.getState().start(CASH, 'math');
    await session.getState().act({ kind: 'passive' });
    const debug = session.getState().debug;
    expect(debug?.snapshot).not.toBeNull();
    expect(debug?.sentBias).toBeNull();
    expect(bot.biases.every((bias) => bias === undefined)).toBe(true);
  });
});
