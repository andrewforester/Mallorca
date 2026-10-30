import type { HandRecord } from '../../../src/game/records/record.ts';
import type { HandSummary } from './analysis.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

export interface LoadedHands {
  summaries: HandSummary[];
  skipped: number;
  record(line: number): Promise<HandRecord>;
  close(): void;
}

interface Pending {
  resolve: (record: HandRecord) => void;
  reject: (error: Error) => void;
}

function settle(pending: Map<number, Pending>, message: WorkerResponse): void {
  if (message.type !== 'record' && message.type !== 'missing') return;
  const waiter = pending.get(message.id);
  pending.delete(message.id);
  if (message.type === 'record') waiter?.resolve(message.record);
  else waiter?.reject(new Error(`no hand on line ${message.line}`));
}

function failAll(pending: Map<number, Pending>, error: Error): void {
  for (const waiter of pending.values()) waiter.reject(error);
  pending.clear();
}

export function loadHands(file: string): Promise<LoadedHands> {
  const worker = new Worker(new URL('./hands.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, Pending>();
  let nextId = 0;
  const send = (request: WorkerRequest) => worker.postMessage(request);
  const close = () => {
    worker.terminate();
    failAll(pending, new Error('hands closed'));
  };
  const record = (line: number) =>
    new Promise<HandRecord>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      send({ type: 'record', id, line });
    });
  return new Promise((resolve, reject) => {
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === 'failed') {
        close();
        reject(new Error(message.message));
      } else if (message.type === 'loaded') {
        resolve({ summaries: message.summaries, skipped: message.skipped, record, close });
      } else {
        settle(pending, message);
      }
    });
    worker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'hands worker failed');
      worker.terminate();
      failAll(pending, error);
      reject(error);
    });
    send({ type: 'load', file });
  });
}
