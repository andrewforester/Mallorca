import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { Worker } from 'node:worker_threads';
import { CASH, rulesOf } from '../../src/engine/index.ts';
import { handRecord } from '../../src/game/records/record.ts';
import { botFactory, botLabel, prepareBots } from './bots.ts';
import { playPair } from './match.ts';
import { summarize } from './stats.ts';
import { styleStats } from './styleStats.ts';
import type { StyleStats } from './styleStats.ts';
import type { WorkerInput, WorkerResult } from './worker.ts';

const BIG_BLIND = rulesOf(CASH).blinds(1).big;

export interface ArenaOptions {
  a: string;
  b: string;
  pairs: number;
  seed: number;
  workers: number;
  saveHands?: string;
  reportDir?: string;
  stats?: boolean;
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
  styleStats?: StyleStats;
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
    const { net, hands } = playPair(botFactory(input.a), botFactory(input.b), input.seed, index);
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

function writeHands(
  path: string,
  results: WorkerResult[],
  run: { labels: [string, string]; seed: number; started: number },
): void {
  const lines: string[] = [];
  for (const result of results) {
    (result.hands ?? []).forEach((events, k) => {
      const [a, b] = run.labels;
      const names: [string, string] = k === 0 ? [a, b] : [b, a];
      const playedAt = new Date(run.started + (result.index * 2 + k) * 1000).toISOString();
      const record = handRecord(events, [], {
        sessionId: `arena-${run.seed}`,
        mode: CASH,
        names,
        humanSeat: null,
        bot: { id: `${a}-vs-${b}`, version: '1' },
        playedAt,
      });
      lines.push(JSON.stringify(record));
    });
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join('\n') + '\n');
}

function styleOfA(results: WorkerResult[]): StyleStats {
  const hands = results.flatMap((result) => result.hands ?? []);
  return styleStats(hands, (index) => (index % 2 === 0 ? 0 : 1));
}

export async function runArena(options: ArenaOptions): Promise<Report> {
  botFactory(options.a);
  botFactory(options.b);
  const started = Date.now();
  const { a, b } = options;
  const labels: [string, string] = [botLabel(a), botLabel(b)];
  const withHands = options.saveHands !== undefined || options.stats === true;
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
    writeHands(options.saveHands, results, { labels, seed: options.seed, started });
  }
  return {
    a: labels[0],
    b: labels[1],
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
    ...(options.stats === true ? { styleStats: styleOfA(results) } : {}),
  };
}
