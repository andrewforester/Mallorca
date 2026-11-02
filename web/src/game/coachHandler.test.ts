import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Brain, Decision, Observation } from '../brains/index.ts';
import { SHIPPED_STRATEGIES, WASM_URL, createCfrModel, inflate } from '../cfr/index.ts';
import type { CfrModel } from '../cfr/index.ts';
import type { Opponent } from './opponent.ts';
import type { WorkerReply } from './workerProtocol.ts';
import { createWorkerHandler } from './workerHandler.ts';

let model: CfrModel;

beforeAll(async () => {
  model = await createCfrModel(
    readFileSync(WASM_URL),
    await inflate(readFileSync(SHIPPED_STRATEGIES.cfr.url)),
  );
});

const legal = { fold: true, check: false, call: 10, raise: { min: 40, max: 2000 } };

const observations: Observation[] = [
  {
    type: 'handStarted',
    handNumber: 1,
    heroOnButton: true,
    heroStack: 2000,
    villainStack: 2000,
    smallBlind: 10,
    bigBlind: 20,
  },
  { type: 'holeCards', cards: [51, 50] },
];

const decision: Decision = {
  action: { kind: 'call' },
  solverChoice: 'passive',
  evByAction: { fold: 0, passive: 0, aggressive: 0 },
};

function brain(range: Float32Array | null = null): Brain & { range(): Float32Array | null } {
  return { observe: () => undefined, decide: () => decision, range: () => range };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createWorkerHandler coach', () => {
  it('answers with facts from the cfr model for the math opponent', async () => {
    const asked: Opponent[] = [];
    const replies: WorkerReply[] = [];
    const handle = createWorkerHandler(
      () => ({ observe: () => undefined, decide: () => decision }),
      (reply) => replies.push(reply),
      () => Promise.reject(new Error('no loader')),
      (opponent) => {
        asked.push(opponent);
        return Promise.resolve(model);
      },
    );
    handle({ kind: 'coach', id: 4, observations, legal, pot: 30 });
    await settle();
    expect(asked).toEqual(['math']);
    const reply = replies[0];
    expect(reply?.id).toBe(4);
    expect(reply !== undefined && 'facts' in reply && reply.facts.versus).toBe('random');
  });

  it('reads the range of the playing brain', async () => {
    const replies: WorkerReply[] = [];
    const range = new Float32Array(1326).fill(1);
    const handle = createWorkerHandler(
      () => brain(range),
      (reply) => replies.push(reply),
      () => Promise.reject(new Error('no loader')),
      () => Promise.resolve(model),
    );
    handle({ kind: 'coach', id: 5, observations, legal, pot: 30 });
    await settle();
    const reply = replies[0];
    expect(reply !== undefined && 'facts' in reply && reply.facts.versus).toBe('range');
  });

  it('reports an error when the model cannot load', async () => {
    const replies: WorkerReply[] = [];
    const handle = createWorkerHandler(
      () => brain(),
      (reply) => replies.push(reply),
      () => Promise.reject(new Error('no loader')),
      () => Promise.reject(new Error('offline')),
    );
    handle({ kind: 'coach', id: 6, observations, legal, pot: 30 });
    await settle();
    expect(replies).toEqual([{ id: 6, error: 'offline' }]);
  });
});
