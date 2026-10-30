import type { Brain } from '../brains/index.ts';
import type { Opponent } from './opponent.ts';
import type { WorkerReply, WorkerRequest } from './workerProtocol.ts';

export type BrainFactory = () => Brain;

export type OpponentLoader = (opponent: Opponent, seed: number) => Promise<BrainFactory>;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Select = Extract<WorkerRequest, { kind: 'select' }>;
type Decide = Extract<WorkerRequest, { kind: 'decide' }>;

function answer(brain: Brain, request: Decide, post: (reply: WorkerReply) => void): void {
  try {
    if (request.style !== undefined) {
      brain.setStyle?.(request.style);
    }
    post({ id: request.id, decision: brain.decide(request.legal) });
  } catch (error) {
    post({ id: request.id, error: message(error) });
  }
}

const mathOnly: OpponentLoader = () =>
  Promise.reject(new Error('This worker plays the math bot only'));

export function createWorkerHandler(
  newBrain: BrainFactory,
  post: (reply: WorkerReply) => void,
  load: OpponentLoader = mathOnly,
): (request: WorkerRequest) => void {
  let make = newBrain;
  let brain = make();
  let waiting: WorkerRequest[] | null = null;
  const replace = (next: BrainFactory) => {
    (brain as { dispose?: () => void }).dispose?.();
    make = next;
    brain = make();
  };
  const select = (request: Select) => {
    waiting = [];
    const chosen =
      request.opponent === 'math'
        ? Promise.resolve(newBrain)
        : load(request.opponent, request.seed);
    void chosen
      .then(
        (factory) => {
          replace(factory);
          post({ id: request.id, opponent: request.opponent });
        },
        (error: unknown) => post({ id: request.id, error: message(error) }),
      )
      .then(() => {
        const queued = waiting ?? [];
        waiting = null;
        queued.forEach(handle);
      });
  };
  const handle = (request: WorkerRequest): void => {
    if (waiting !== null) {
      waiting.push(request);
      return;
    }
    switch (request.kind) {
      case 'reset':
        replace(make);
        break;
      case 'observe':
        for (const observation of request.observations) {
          brain.observe(observation);
        }
        break;
      case 'decide':
        answer(brain, request, post);
        break;
      case 'select':
        select(request);
        break;
    }
  };
  return handle;
}
