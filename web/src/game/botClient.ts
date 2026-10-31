import { createMathBrain } from '../brains/index.ts';
import type { Decision, Observation } from '../brains/index.ts';
import type { CoachFacts } from '../coach/index.ts';
import type { LegalActions } from '../engine/index.ts';
import type { Opponent } from './opponent.ts';
import type { WorkerReply, WorkerRequest } from './workerProtocol.ts';

export interface BotClient {
  observe(o: Observation[]): void;
  decide(legal: LegalActions): Promise<Decision>;
  reset(): void;
  select?(opponent: Opponent, seed: number): Promise<Opponent>;
  coach?(observations: Observation[], legal: LegalActions, pot: number): Promise<CoachFacts>;
  dispose?(): void;
}

export const BOT_TIMEOUT_MS = 5000;
export const SELECT_TIMEOUT_MS = 60_000;

function newBrain() {
  return createMathBrain();
}

export function inProcessBot(): BotClient {
  let brain = newBrain();
  return {
    observe(observations) {
      for (const observation of observations) {
        brain.observe(observation);
      }
    },
    decide(legal) {
      const current = brain;
      return Promise.resolve().then(() => current.decide(legal));
    },
    reset() {
      brain = newBrain();
    },
    select(opponent) {
      return opponent === 'math'
        ? Promise.resolve('math')
        : Promise.reject(new Error('The in-process bot plays the math bot only'));
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`The bot did not answer within ${ms} ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

const guarded = new WeakSet<BotClient>();

function selectOrFallBack(
  asked: Promise<Opponent> | undefined,
  fallBack: () => void,
): Promise<Opponent> {
  if (asked === undefined) {
    return Promise.resolve('math');
  }
  return withTimeout(asked, SELECT_TIMEOUT_MS).catch((): Opponent => {
    fallBack();
    return 'math';
  });
}

function timedCoach(ask: Promise<CoachFacts> | undefined, ms: number): Promise<CoachFacts> {
  return ask === undefined
    ? Promise.reject(new Error('The coach is not available'))
    : withTimeout(ask, ms);
}

export function withFallback(primary: BotClient, timeoutMs = BOT_TIMEOUT_MS): BotClient {
  if (guarded.has(primary)) {
    return primary;
  }
  let active = primary;
  let usedFallback = false;
  let seen: Observation[] = [];
  let generation = 0;
  const fallBack = () => {
    usedFallback = true;
    primary.dispose?.();
    const fallback = inProcessBot();
    fallback.observe(seen);
    active = fallback;
    return fallback;
  };
  const client: BotClient = {
    observe(observations) {
      seen.push(...observations);
      active.observe(observations);
    },
    reset() {
      generation += 1;
      seen = [];
      active.reset();
    },
    async decide(legal) {
      const mine = generation;
      try {
        return await withTimeout(
          Promise.resolve().then(() => active.decide(legal)),
          timeoutMs,
        );
      } catch (error) {
        if (usedFallback || mine !== generation) {
          throw error;
        }
        return fallBack().decide(legal);
      }
    },
    coach: (...args) => timedCoach(usedFallback ? undefined : active.coach?.(...args), timeoutMs),
    select: (opponent, seed) =>
      selectOrFallBack(active.select?.(opponent, seed), () => {
        if (!usedFallback) {
          fallBack();
        }
      }),
    dispose() {
      generation += 1;
      active.dispose?.();
      primary.dispose?.();
    },
  };
  guarded.add(client);
  return client;
}

type Pending = { resolve: (reply: WorkerReply) => void; reject: (e: Error) => void };

type Ask = <T>(
  build: (id: number) => WorkerRequest,
  pick: (r: WorkerReply) => T | undefined,
) => Promise<T>;

function replyRouter(pending: Map<number, Pending>) {
  return (event: MessageEvent<WorkerReply>) => {
    const reply = event.data;
    const entry = pending.get(reply.id);
    if (entry === undefined) {
      return;
    }
    pending.delete(reply.id);
    if ('error' in reply) {
      entry.reject(new Error(reply.error));
    } else {
      entry.resolve(reply);
    }
  };
}

function asker(pending: Map<number, Pending>, send: (request: WorkerRequest) => void): Ask {
  let nextId = 1;
  return (build, pick) => {
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      const accept = (reply: WorkerReply) => {
        const value = pick(reply);
        if (value === undefined) {
          reject(new Error('The bot worker sent an unexpected reply'));
        } else {
          resolve(value);
        }
      };
      pending.set(id, { resolve: accept, reject });
      send(build(id));
    });
  };
}

function rawWorkerBot(): BotClient {
  const worker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, Pending>();
  const failAll = (message: string) => {
    for (const { reject } of pending.values()) {
      reject(new Error(message));
    }
    pending.clear();
  };
  worker.onmessage = replyRouter(pending);
  worker.onerror = () => {
    failAll('The bot worker failed');
  };
  const send = (request: WorkerRequest) => {
    worker.postMessage(request);
  };
  const ask = asker(pending, send);
  return {
    observe(observations) {
      send({ kind: 'observe', observations });
    },
    decide(legal) {
      return ask(
        (id) => ({ kind: 'decide', id, legal }),
        (r) => ('decision' in r ? r.decision : undefined),
      );
    },
    select(opponent, seed) {
      return ask(
        (id) => ({ kind: 'select', id, opponent, seed }),
        (r) => ('opponent' in r ? r.opponent : undefined),
      );
    },
    coach(observations, legal, pot) {
      return ask(
        (id) => ({ kind: 'coach', id, observations, legal, pot }),
        (r) => ('facts' in r ? r.facts : undefined),
      );
    },
    reset() {
      send({ kind: 'reset' });
    },
    dispose() {
      failAll('The bot worker was stopped');
      worker.terminate();
    },
  };
}

export function workerBot(): BotClient {
  return withFallback(rawWorkerBot());
}
