import type { HandRecord } from '../../../src/game/records/record.ts';
import type { HandSummary } from './analysis.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

export interface LoadedHands {
  summaries: HandSummary[];
  skipped: number;
  record(line: number): Promise<HandRecord>;
  close(): void;
}

export function loadHands(file: string): Promise<LoadedHands> {
  const worker = new Worker(new URL('./hands.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, (record: HandRecord) => void>();
  let nextId = 0;
  const send = (request: WorkerRequest) => worker.postMessage(request);
  return new Promise((resolve, reject) => {
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === 'failed') {
        worker.terminate();
        reject(new Error(message.message));
      } else if (message.type === 'record') {
        pending.get(message.id)?.(message.record);
        pending.delete(message.id);
      } else {
        resolve({
          summaries: message.summaries,
          skipped: message.skipped,
          record: (line) =>
            new Promise((done) => {
              const id = nextId++;
              pending.set(id, done);
              send({ type: 'record', id, line });
            }),
          close: () => worker.terminate(),
        });
      }
    });
    worker.addEventListener('error', (event) => {
      worker.terminate();
      reject(new Error(event.message || 'hands worker failed'));
    });
    send({ type: 'load', file });
  });
}
