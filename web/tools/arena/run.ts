import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { Worker } from 'node:worker_threads';
import { CASH } from '../../src/engine/index.ts';
import { handRecord } from '../../src/game/records/record.ts';
import { BOTS, prepareBots } from './bots.ts';
import type { BotName } from './bots.ts';
import { playPair } from './match.ts';
import { summarize } from './stats.ts';
import type { WorkerInput, WorkerResult } from './worker.ts';

const BIG_BLIND = 20;

export interface ArenaOptions {
  a: string;
  b: string;
  pairs: number;
  seed: number;
  workers: number;
  saveHands?: string;
  reportDir?: string;
}

export interface Report {
  a: string;
  b: string;
  pairs: number;
  hands: number;
  seed: number;
  bbPer100: number;
  ci95: number | null;
  durationMs: number;
  commit: string;
  finishedAt: string;
  handsFile: string | null;
}

function commitHash(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function chunks(count: number, parts: number): number[][] {
  const size = Math.ceil(count / parts);
  const result: number[][] = [];
  for (let start = 0; start < count; start += size) {
    result.push(Array.from({ length: Math.min(size, count - start) }, (_, i) => start + i));
  }
  return result;
}

function runInProcess(input: WorkerInput): WorkerResult[] {
  return input.indices.map((index) => {
    const { net, hands } = playPair(BOTS[input.a], BOTS[input.b], input.seed, index);
    return input.withHands ? { index, net, hands } : { index, net };
  });
}

export function runInWorker(input: WorkerInput): Promise<WorkerResult[]> {
  return new Promise((resolve, reject) => {
    const results: WorkerResult[] = [];
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { workerData: input });
    worker.on('message', (result: WorkerResult) => results.push(result));
    worker.on('error', reject);
    worker.on('exit', (code) =>
      code === 0 ? resolve(results) : reject(new Error(`worker exited with code ${code}`)),
    );
  });
}

export async function runArena(options: ArenaOptions): Promise<Report> {
  for (const name of [options.a, options.b]) {
    if (!Object.hasOwn(BOTS, name)) {
      throw new Error(`unknown bot "${name}", choose from: ${Object.keys(BOTS).join(', ')}`);
    }
  }
  const started = Date.now();
  const a = options.a as BotName;
  const b = options.b as BotName;
  const withHands = options.saveHands !== undefined;
  const inputs: WorkerInput[] = chunks(options.pairs, Math.max(1, options.workers)).map(
    (indices) => ({ a, b, seed: options.seed, indices, withHands }),
  );
  if (options.workers <= 1) {
    await prepareBots([a, b]);
  }
  const batches =
    options.workers <= 1 ? inputs.map(runInProcess) : await Promise.all(inputs.map(runInWorker));
  const results = batches.flat().sort((x, y) => x.index - y.index);
  const stats = summarize(
    results.map((r) => r.net),
    BIG_BLIND,
  );
  if (options.saveHands !== undefined) {
    const lines: string[] = [];
    for (const result of results) {
      (result.hands ?? []).forEach((events, k) => {
        const names: [string, string] = k === 0 ? [a, b] : [b, a];
        const playedAt = new Date(started + (result.index * 2 + k) * 1000).toISOString();
        const record = handRecord(events, [], {
          sessionId: `arena-${options.seed}`,
          mode: CASH,
          names,
          humanSeat: null,
          bot: { id: `${a}-vs-${b}`, version: '1' },
          playedAt,
        });
        lines.push(JSON.stringify(record));
      });
    }
    mkdirSync(dirname(options.saveHands), { recursive: true });
    writeFileSync(options.saveHands, lines.join('\n') + '\n');
  }
  return {
    a,
    b,
    pairs: stats.pairs,
    hands: stats.hands,
    seed: options.seed,
    bbPer100: stats.bbPer100,
    ci95: Number.isFinite(stats.ci95) ? stats.ci95 : null,
    durationMs: Date.now() - started,
    commit: commitHash(),
    finishedAt: new Date().toISOString(),
    handsFile:
      options.saveHands === undefined
        ? null
        : relative(options.reportDir ?? process.cwd(), options.saveHands),
  };
}
