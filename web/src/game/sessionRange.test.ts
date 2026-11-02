import { describe, expect, it, vi } from 'vitest';
import { CASH } from '../engine/index.ts';
import type * as PersonaModule from '../persona/index.ts';
import type { Persona, PersonaOptions } from '../persona/index.ts';
import { createSession } from './session.ts';
import type { Session } from './session.ts';
import { silentConversationClient } from './conversationClient.ts';
import { callingBot } from './testBot.ts';
import type { ScriptedBot } from './testBot.ts';

const given: { weights: ArrayLike<number>; handNumber: number }[] = [];

vi.mock('../persona/index.ts', async (importOriginal) => {
  const original = await importOriginal<typeof PersonaModule>();
  return {
    ...original,
    createPersona: (options: PersonaOptions): Persona => {
      const persona = original.createPersona(options);
      const narrow = persona.narrow.bind(persona);
      persona.narrow = (weights, handNumber) => {
        given.push({ weights, handNumber });
        narrow(weights, handNumber);
      };
      return persona;
    },
  };
});

interface Asked {
  resolve(range: Float32Array | null): void;
  reject(): void;
}

interface Table {
  session: Session;
  asked: Asked[];
  calls: string[];
}

function open(): Table {
  given.length = 0;
  const asked: Asked[] = [];
  const calls: string[] = [];
  const calling = callingBot();
  const bot: ScriptedBot = {
    ...calling,
    select: (opponent) => Promise.resolve(opponent),
    decide: (legal) => {
      calls.push('decide');
      return calling.decide(legal);
    },
    opponentRange: () =>
      new Promise<Float32Array | null>((resolve, reject) => {
        calls.push('range');
        asked.push({ resolve, reject: () => reject(new Error('gone')) });
      }),
  };
  const session = createSession({
    bot,
    seed: 7,
    botDelayMs: 0,
    humanSeat: 1,
    names: ['Mallorca', 'You'],
    mode: CASH,
    conversation: silentConversationClient,
  });
  return { session, asked, calls };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const range = (w: number): Float32Array => new Float32Array(1326).fill(w);

async function begin(table: Table, opponent?: 'cfr'): Promise<void> {
  await table.session.getState().start(CASH, opponent);
  await flush();
}

async function playerCalls(table: Table): Promise<void> {
  await table.session.getState().act({ kind: 'passive' });
  await flush();
}

describe("the player's range in the session", () => {
  it('is asked after his action and given to her conversation with the hand number', async () => {
    const table = open();
    await begin(table, 'cfr');
    expect(table.asked).toHaveLength(0);
    await playerCalls(table);
    expect(table.asked).toHaveLength(1);
    table.asked[0]?.resolve(range(0.5));
    await flush();
    expect(given).toEqual([{ weights: range(0.5), handNumber: 1 }]);
  });

  it('keeps her range on null, an error, a later request or a new start', async () => {
    const table = open();
    await begin(table, 'cfr');
    await playerCalls(table);
    await playerCalls(table);
    expect(table.asked).toHaveLength(2);
    table.asked[0]?.resolve(range(0.1));
    table.asked[1]?.resolve(null);
    await playerCalls(table);
    expect(table.asked).toHaveLength(3);
    await begin(table, 'cfr');
    table.asked[2]?.resolve(range(0.2));
    await playerCalls(table);
    expect(table.asked).toHaveLength(4);
    table.asked[3]?.reject();
    await flush();
    expect(given).toEqual([]);
  });

  it('is asked after the decision his action gives the bot', async () => {
    const table = open();
    await begin(table, 'cfr');
    await playerCalls(table);
    table.calls.length = 0;
    await playerCalls(table);
    expect(table.calls.slice(0, 2)).toEqual(['decide', 'range']);
  });

  it('is never asked against the math bot', async () => {
    const table = open();
    await begin(table);
    await playerCalls(table);
    await playerCalls(table);
    expect(table.asked).toHaveLength(0);
  });
});
