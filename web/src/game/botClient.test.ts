import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Decision, Observation } from '../brains/index.ts';
import type { BotClient } from './botClient.ts';
import { BOT_TIMEOUT_MS, inProcessBot, withFallback, workerBot } from './botClient.ts';
import type { WorkerReply, WorkerRequest } from './workerProtocol.ts';

const legal = { fold: true, check: false, call: 10, raise: { min: 40, max: 2000 } };

const hand: Observation[] = [
  {
    type: 'handStarted',
    handNumber: 1,
    heroOnButton: true,
    heroStack: 2000,
    villainStack: 2000,
    smallBlind: 10,
    bigBlind: 20,
  },
  { type: 'holeCards', cards: [48, 44] },
];

const decision: Decision = {
  action: { kind: 'call' },
  solverChoice: 'passive',
  evByAction: { fold: 0, passive: 0, aggressive: 0 },
};

afterEach(() => {
  vi.useRealTimers();
});

describe('inProcessBot', () => {
  it('decides with the brain that was current when decide was called', async () => {
    const bot = inProcessBot();
    bot.observe(hand);
    const pending = bot.decide(legal);
    bot.reset();
    await expect(pending).resolves.toMatchObject({ action: expect.any(Object) });
    await expect(bot.decide(legal)).rejects.toThrow();
  });
});

describe('withFallback', () => {
  it('does not spend the fallback on a request superseded by reset', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const primary: BotClient = {
      observe: () => undefined,
      reset: () => undefined,
      decide: () => {
        calls += 1;
        return calls === 1 ? new Promise<Decision>(() => undefined) : Promise.resolve(decision);
      },
    };
    const bot = withFallback(primary, 100);
    const stale = bot.decide(legal);
    const staleOutcome = stale.then(
      () => 'resolved',
      () => 'rejected',
    );
    bot.reset();
    await expect(bot.decide(legal)).resolves.toBe(decision);
    await vi.advanceTimersByTimeAsync(100);
    await expect(staleOutcome).resolves.toBe('rejected');
    await expect(bot.decide(legal)).resolves.toBe(decision);
    expect(calls).toBe(3);
  });
});

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<WorkerReply>) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: WorkerRequest[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: WorkerRequest) {
    this.sent.push(request);
  }

  terminate() {
    this.terminated = true;
  }

  reply(reply: WorkerReply) {
    this.onmessage?.({ data: reply } as MessageEvent<WorkerReply>);
  }

  decideIds() {
    return this.sent.flatMap((request) => (request.kind === 'decide' ? [request.id] : []));
  }
}

function currentWorker() {
  const worker = FakeWorker.instances.at(-1);
  if (worker === undefined) {
    throw new Error('no worker was created');
  }
  return worker;
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function startDecide(bot: BotClient) {
  const pending = bot.decide(legal);
  await settle();
  const worker = currentWorker();
  return { pending, worker, id: worker.decideIds().at(-1) as number };
}

describe('workerBot', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts observe and reset requests to the worker', () => {
    const bot = workerBot();
    bot.observe(hand);
    bot.reset();
    expect(currentWorker().sent).toEqual([
      { kind: 'observe', observations: hand },
      { kind: 'reset' },
    ]);
  });

  it('correlates each reply with its request by id', async () => {
    const bot = workerBot();
    const first = await startDecide(bot);
    const second = await startDecide(bot);
    const other: Decision = { ...decision, solverChoice: 'aggressive' };
    first.worker.reply({ id: second.id, decision: other });
    first.worker.reply({ id: first.id, decision });
    await expect(first.pending).resolves.toBe(decision);
    await expect(second.pending).resolves.toBe(other);
  });

  it('ignores replies for unknown ids', async () => {
    const bot = workerBot();
    const { pending, worker, id } = await startDecide(bot);
    worker.reply({ id: 999, decision: { ...decision, solverChoice: 'aggressive' } });
    worker.reply({ id, decision });
    await expect(pending).resolves.toBe(decision);
  });

  it('ignores a second reply for an id that was already answered', async () => {
    const bot = workerBot();
    const { pending, worker, id } = await startDecide(bot);
    worker.reply({ id, decision });
    worker.reply({ id, error: 'late' });
    await expect(pending).resolves.toBe(decision);
  });

  it('falls back to the in-process bot when the worker replies with an error', async () => {
    const bot = workerBot();
    bot.observe(hand);
    const { pending, worker, id } = await startDecide(bot);
    worker.reply({ id, error: 'worker exploded' });
    await expect(pending).resolves.toMatchObject({ action: expect.any(Object) });
    expect(worker.terminated).toBe(true);
  });

  it('rejects when the in-process fallback fails as well', async () => {
    const bot = workerBot();
    const { pending, worker, id } = await startDecide(bot);
    worker.reply({ id, error: 'worker exploded' });
    await expect(pending).rejects.toThrow('The brain has not seen its hole cards');
    await expect(bot.decide(legal)).rejects.toThrow();
  });

  it('falls back when the worker reports an error event', async () => {
    const bot = workerBot();
    bot.observe(hand);
    const { pending, worker } = await startDecide(bot);
    worker.onerror?.();
    await expect(pending).resolves.toMatchObject({ action: expect.any(Object) });
    expect(worker.terminated).toBe(true);
  });

  it('falls back to the in-process bot after the timeout', async () => {
    vi.useFakeTimers();
    const bot = workerBot();
    bot.observe(hand);
    const pending = bot.decide(legal);
    const settled = expect(pending).resolves.toMatchObject({ action: expect.any(Object) });
    await vi.advanceTimersByTimeAsync(BOT_TIMEOUT_MS);
    await settled;
    expect(currentWorker().terminated).toBe(true);
  });

  it('sends the style with the decide request', async () => {
    const bot = workerBot();
    const style = { aggression: 1.1, bluff: 1, tightness: 0.9, sizing: 1, stickiness: 1 };
    const pending = bot.decide(legal, style);
    await settle();
    const sent = currentWorker().sent.at(-1);
    expect(sent).toMatchObject({ kind: 'decide', style });
    bot.dispose?.();
    await pending.catch(() => undefined);
  });

  it('asks for the explanation only when told to', async () => {
    const bot = workerBot();
    const first = bot.decide(legal, undefined, true);
    await settle();
    expect(currentWorker().sent.at(-1)).toMatchObject({ kind: 'decide', explain: true });
    const second = bot.decide(legal);
    await settle();
    expect(currentWorker().sent.at(-1)).not.toHaveProperty('explain');
    bot.dispose?.();
    await first.catch(() => undefined);
    await second.catch(() => undefined);
  });

  it('fallback ignores style', async () => {
    vi.useFakeTimers();
    const bot = workerBot();
    bot.observe(hand);
    const style = { aggression: 1.3, bluff: 1.2, tightness: 0.8, sizing: 1.1, stickiness: 1.2 };
    const pending = bot.decide(legal, style);
    const settled = expect(pending).resolves.toMatchObject({ action: expect.any(Object) });
    await vi.advanceTimersByTimeAsync(BOT_TIMEOUT_MS);
    await settled;
    await expect(bot.decide(legal, style)).resolves.toMatchObject({ action: expect.any(Object) });
  });

  it('rejects pending requests and terminates the worker on dispose', async () => {
    const bot = workerBot();
    const { pending, worker } = await startDecide(bot);
    const outcome = pending.then(
      () => 'resolved',
      (error: Error) => error.message,
    );
    bot.dispose?.();
    await expect(outcome).resolves.toBe('The bot worker was stopped');
    expect(worker.terminated).toBe(true);
  });
});

describe('withFallback guards', () => {
  const failing = (reason: unknown): BotClient => ({
    observe: () => undefined,
    reset: () => undefined,
    decide: () => Promise.reject(reason),
  });

  it('returns an already guarded client unchanged', () => {
    const guardedBot = withFallback(inProcessBot());
    expect(withFallback(guardedBot)).toBe(guardedBot);
  });

  it('forwards observations seen so far to the fallback', async () => {
    const bot = withFallback(failing(new Error('primary failed')), 100);
    bot.observe(hand);
    await expect(bot.decide(legal)).resolves.toMatchObject({ action: expect.any(Object) });
  });

  it('wraps a non-Error rejection of a superseded request into an Error', async () => {
    const bot = withFallback(failing('plain string'), 100);
    const stale = bot.decide(legal);
    bot.reset();
    await expect(stale).rejects.toThrow('plain string');
  });

  it('disposes the primary and the active client on dispose', () => {
    const disposed: string[] = [];
    const primary: BotClient = {
      observe: () => undefined,
      reset: () => undefined,
      decide: () => Promise.resolve(decision),
      dispose: () => {
        disposed.push('primary');
      },
    };
    withFallback(primary).dispose?.();
    expect(disposed).toEqual(['primary', 'primary']);
  });
});

describe('select', () => {
  it('the in-process bot plays the math bot only', async () => {
    const bot = inProcessBot();
    await expect(bot.select?.('math', 1)).resolves.toBe('math');
    await expect(bot.select?.('cfr', 1)).rejects.toThrow(/math/);
  });

  it('falls back to the in-process math bot when the opponent cannot load', async () => {
    let disposed = false;
    const primary: BotClient = {
      observe: () => undefined,
      reset: () => undefined,
      decide: () => Promise.reject(new Error('never asked')),
      select: () => Promise.reject(new Error('no wasm')),
      dispose: () => {
        disposed = true;
      },
    };
    const bot = withFallback(primary);
    await expect(bot.select?.('cfr', 3)).resolves.toBe('math');
    expect(disposed).toBe(true);
    bot.observe(hand);
    await expect(bot.decide(legal)).resolves.toMatchObject({ action: expect.any(Object) });
  });

  it('a client without select plays the math bot', async () => {
    const primary: BotClient = {
      observe: () => undefined,
      reset: () => undefined,
      decide: () => Promise.resolve(decision),
    };
    await expect(withFallback(primary).select?.('cfr', 3)).resolves.toBe('math');
    await expect(withFallback(primary).select?.('math', 3)).resolves.toBe('math');
  });
});

describe('workerBot select', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the worker for the opponent and resolves with its answer', async () => {
    const bot = workerBot();
    const pending = bot.select?.('cfr', 9);
    await settle();
    const worker = currentWorker();
    const request = worker.sent.at(-1);
    expect(request).toMatchObject({ kind: 'select', opponent: 'cfr', seed: 9 });
    worker.reply({ id: (request as { id: number }).id, opponent: 'cfr' });
    await expect(pending).resolves.toBe('cfr');
  });
});

describe('withFallback coach', () => {
  it('gives up on a coach that never answers', async () => {
    const silent: BotClient = {
      observe: () => undefined,
      reset: () => undefined,
      decide: () => new Promise(() => undefined),
      coach: () => new Promise(() => undefined),
    };
    const client = withFallback(silent, 10);
    const legal = { fold: false, check: true, call: null, raise: null };
    await expect(client.coach?.([], legal, 40)).rejects.toThrow();
  });
});

describe('opponentRange', () => {
  const asking = (opponentRange?: () => Promise<Float32Array | null>): BotClient => ({
    observe: () => undefined,
    reset: () => undefined,
    decide: () => Promise.resolve(decision),
    ...(opponentRange === undefined ? {} : { opponentRange }),
  });

  it('forwards the range of the active client', async () => {
    const range = new Float32Array([0.5]);
    const client = withFallback(asking(() => Promise.resolve(range)));
    await expect(client.opponentRange?.()).resolves.toBe(range);
  });

  it('answers null for a client without one, an error or no answer', async () => {
    await expect(withFallback(asking()).opponentRange?.()).resolves.toBeNull();
    const failing = withFallback(asking(() => Promise.reject(new Error('gone'))));
    await expect(failing.opponentRange?.()).resolves.toBeNull();
    const silent = withFallback(
      asking(() => new Promise(() => undefined)),
      10,
    );
    await expect(silent.opponentRange?.()).resolves.toBeNull();
  });

  it('answers null after the fallback', async () => {
    const broken: BotClient = {
      ...asking(() => Promise.resolve(new Float32Array([1]))),
      decide: () => Promise.reject(new Error('down')),
    };
    const client = withFallback(broken);
    await client.decide(legal).catch(() => undefined);
    await expect(client.opponentRange?.()).resolves.toBeNull();
  });
});

describe('workerBot opponentRange', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the worker after the observations and resolves with its range', async () => {
    const bot = workerBot();
    bot.observe(hand);
    const pending = bot.opponentRange?.();
    await settle();
    const worker = currentWorker();
    const request = worker.sent.at(-1) as { kind: string; id: number };
    expect(worker.sent.map((r) => r.kind)).toEqual(['observe', 'opponentRange']);
    const range = new Float32Array([0.25]);
    worker.reply({ id: request.id, range });
    await expect(pending).resolves.toBe(range);
  });
});
