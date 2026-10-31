import { parentPort, workerData } from 'node:worker_threads';
import type { EngineEvent } from '../../src/engine/index.ts';
import { botFactory, prepareBots } from './bots.ts';
import { playPair } from './match.ts';

export interface WorkerInput {
  a: string;
  b: string;
  seed: number;
  indices: number[];
  withHands: boolean;
}

export interface WorkerResult {
  index: number;
  net: number;
  hands?: EngineEvent[][];
}

const input = workerData as WorkerInput;
await prepareBots([input.a, input.b]);
for (const index of input.indices) {
  const { net, hands } = playPair(botFactory(input.a), botFactory(input.b), input.seed, index);
  const result: WorkerResult = input.withHands ? { index, net, hands } : { index, net };
  parentPort?.postMessage(result);
}
