import type { Brain } from '../brains/index.ts';
import { coachFacts } from '../coach/index.ts';
import type { CfrModel } from '../cfr/index.ts';
import type { Opponent } from './opponent.ts';
import type { WorkerReply, WorkerRequest } from './workerProtocol.ts';

export type CoachedBrain = Brain & {
  range?: () => Float32Array | null;
  opponentRange?: () => Float32Array | null;
};

export type BrainFactory = () => CoachedBrain;

export type CoachModel = (opponent: Opponent) => Promise<CfrModel>;

export type OpponentLoader = (opponent: Opponent, seed: number) => Promise<BrainFactory>;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Select = Extract<WorkerRequest, { kind: 'select' }>;
type Decide = Extract<WorkerRequest, { kind: 'decide' }>;
type Coach = Extract<WorkerRequest, { kind: 'coach' }>;

function answer(brain: Brain, request: Decide, post: (reply: WorkerReply) => void): void {
  try {
    if (request.style !== undefined) {
      brain.setStyle?.(request.style);
    }
    const decision = brain.decide(request.legal);
    const breakdown = request.explain === true ? brain.explain?.() : undefined;
    post({ id: request.id, decision: breakdown ? { ...decision, breakdown } : decision });
  } catch (error) {
    post({ id: request.id, error: message(error) });
  }
}

function coach(
  request: Coach,
  range: Float32Array | null,
  model: Promise<CfrModel>,
  post: (reply: WorkerReply) => void,
): void {
  const { id, observations, legal, pot } = request;
  void model
    .then((loaded) => coachFacts({ model: loaded, observations, legal, pot, range }))
    .then(
      (facts) => post({ id, facts }),
      (error: unknown) => post({ id, error: message(error) }),
    );
}

function opponentRange(brain: CoachedBrain, id: number, post: (reply: WorkerReply) => void): void {
  try {
    post({ id, range: brain.opponentRange?.() ?? null });
  } catch (error) {
    post({ id, error: message(error) });
  }
}

interface BrainSlot {
  brain: CoachedBrain;
  opponent: Opponent;
  replace(next: BrainFactory, opponent: Opponent): void;
  reset(): void;
}

function brainSlot(newBrain: BrainFactory): BrainSlot {
  let make = newBrain;
  const slot: BrainSlot = {
    brain: make(),
    opponent: 'math',
    replace(next, opponent) {
      slot.brain.dispose?.();
      make = next;
      slot.brain = make();
      slot.opponent = opponent;
    },
    reset() {
      slot.replace(make, slot.opponent);
    },
  };
  return slot;
}

export function createWorkerHandler(
  newBrain: BrainFactory,
  post: (reply: WorkerReply) => void,
  load: OpponentLoader,
  coachModel: CoachModel,
): (request: WorkerRequest) => void {
  const slot = brainSlot(newBrain);
  let waiting: WorkerRequest[] | null = null;
  const select = (request: Select) => {
    waiting = [];
    const chosen =
      request.opponent === 'math'
        ? Promise.resolve(newBrain)
        : load(request.opponent, request.seed);
    void chosen
      .then(
        (factory) => {
          slot.replace(factory, request.opponent);
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
        slot.reset();
        break;
      case 'observe':
        for (const observation of request.observations) {
          slot.brain.observe(observation);
        }
        break;
      case 'decide':
        answer(slot.brain, request, post);
        break;
      case 'select':
        select(request);
        break;
      case 'coach':
        coach(request, slot.brain.range?.() ?? null, coachModel(slot.opponent), post);
        break;
      case 'opponentRange':
        opponentRange(slot.brain, request.id, post);
        break;
    }
  };
  return handle;
}
