import { describe, expect, it } from 'vitest';
import type { Brain, Decision, Observation } from '../brains/index.ts';
import type { WorkerReply } from './workerProtocol.ts';
import { createWorkerHandler } from './workerHandler.ts';

const legal = { fold: true, check: false, call: 10, raise: { min: 40, max: 2000 } };

const observation: Observation = { type: 'holeCards', cards: [48, 44] };

const decision: Decision = {
  action: { kind: 'call' },
  solverChoice: 'passive',
  evByAction: { fold: 0, passive: 0, aggressive: 0 },
};

const noLoader = () => Promise.reject(new Error('no loader'));

const noCoach = () => Promise.reject(new Error('no coach'));

function fakeBrain(decide: Brain['decide'] = () => decision) {
  const observed: Observation[] = [];
  const brain: Brain = {
    observe: (o) => {
      observed.push(o);
    },
    decide,
  };
  return { brain, observed };
}

describe('createWorkerHandler', () => {
  it('feeds every observation to the brain', () => {
    const { brain, observed } = fakeBrain();
    const handle = createWorkerHandler(
      () => brain,
      () => undefined,
      noLoader,
      noCoach,
    );
    handle({ kind: 'observe', observations: [observation, observation] });
    expect(observed).toHaveLength(2);
  });

  it('replies to decide with the decision and the request id', () => {
    const { brain } = fakeBrain();
    const replies: WorkerReply[] = [];
    const handle = createWorkerHandler(
      () => brain,
      (reply) => replies.push(reply),
      noLoader,
      noCoach,
    );
    handle({ kind: 'decide', id: 7, legal });
    expect(replies).toEqual([{ id: 7, decision }]);
  });

  it('replies with the error message when the brain throws an Error', () => {
    const { brain } = fakeBrain(() => {
      throw new Error('no cards');
    });
    const replies: WorkerReply[] = [];
    const handle = createWorkerHandler(
      () => brain,
      (reply) => replies.push(reply),
      noLoader,
      noCoach,
    );
    handle({ kind: 'decide', id: 3, legal });
    expect(replies).toEqual([{ id: 3, error: 'no cards' }]);
  });

  it('replies with the stringified value when the brain throws a non-Error', () => {
    const { brain } = fakeBrain(() => {
      throw 'boom';
    });
    const replies: WorkerReply[] = [];
    const handle = createWorkerHandler(
      () => brain,
      (reply) => replies.push(reply),
      noLoader,
      noCoach,
    );
    handle({ kind: 'decide', id: 4, legal });
    expect(replies).toEqual([{ id: 4, error: 'boom' }]);
  });

  it('builds a fresh brain on reset and sends no reply', () => {
    const first = fakeBrain();
    const second = fakeBrain();
    const brains = [first.brain, second.brain];
    const replies: WorkerReply[] = [];
    const handle = createWorkerHandler(
      () => brains.shift() as Brain,
      (reply) => replies.push(reply),
      noLoader,
      noCoach,
    );
    handle({ kind: 'observe', observations: [observation] });
    handle({ kind: 'reset' });
    handle({ kind: 'observe', observations: [observation] });
    expect(first.observed).toHaveLength(1);
    expect(second.observed).toHaveLength(1);
    expect(replies).toEqual([]);
  });
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('createWorkerHandler select', () => {
  it('swaps the brain once the opponent is ready and replays what came meanwhile', async () => {
    const math = fakeBrain();
    const aggressive: Decision = { ...decision, solverChoice: 'aggressive' };
    const cfr = fakeBrain(() => aggressive);
    const replies: WorkerReply[] = [];
    let release = () => {};
    const seeds: number[] = [];
    const handle = createWorkerHandler(
      () => math.brain,
      (reply) => replies.push(reply),
      (_opponent, seed) => {
        seeds.push(seed);
        return new Promise((resolve) => {
          release = () => resolve(() => cfr.brain);
        });
      },
      noCoach,
    );
    handle({ kind: 'select', id: 1, opponent: 'cfr', seed: 5 });
    handle({ kind: 'observe', observations: [observation] });
    handle({ kind: 'decide', id: 2, legal });
    expect(replies).toEqual([]);
    release();
    await settle();
    expect(seeds).toEqual([5]);
    expect(replies).toEqual([
      { id: 1, opponent: 'cfr' },
      { id: 2, decision: aggressive },
    ]);
    expect(cfr.observed).toHaveLength(1);
    expect(math.observed).toHaveLength(0);
  });

  it('keeps the current brain and reports the error when the opponent cannot load', async () => {
    const math = fakeBrain();
    const replies: WorkerReply[] = [];
    const handle = createWorkerHandler(
      () => math.brain,
      (reply) => replies.push(reply),
      () => Promise.reject(new Error('no wasm')),
      noCoach,
    );
    handle({ kind: 'select', id: 1, opponent: 'cfr', seed: 5 });
    handle({ kind: 'decide', id: 2, legal });
    await settle();
    expect(replies).toEqual([
      { id: 1, error: 'no wasm' },
      { id: 2, decision },
    ]);
  });

  it('selects the math bot without asking the loader', async () => {
    const replies: WorkerReply[] = [];
    const asked: string[] = [];
    const handle = createWorkerHandler(
      () => fakeBrain().brain,
      (reply) => replies.push(reply),
      (opponent) => {
        asked.push(opponent);
        return Promise.reject(new Error('no model'));
      },
      noCoach,
    );
    handle({ kind: 'select', id: 3, opponent: 'math', seed: 1 });
    handle({ kind: 'select', id: 4, opponent: 'cfr', seed: 1 });
    await settle();
    expect(asked).toEqual(['cfr']);
    expect(replies).toEqual([
      { id: 3, opponent: 'math' },
      { id: 4, error: 'no model' },
    ]);
  });

  it('disposes the brain it replaces', () => {
    let disposed = 0;
    const handle = createWorkerHandler(
      () => ({ ...fakeBrain().brain, dispose: () => (disposed += 1) }),
      () => undefined,
      noLoader,
      noCoach,
    );
    handle({ kind: 'reset' });
    handle({ kind: 'reset' });
    expect(disposed).toBe(2);
  });
});
