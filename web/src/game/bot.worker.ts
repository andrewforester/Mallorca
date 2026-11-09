import { createMathBrain } from '../brains/index.ts';
import { mulberry32 } from '../cards/index.ts';
import { SHIPPED_STRATEGIES, createCfrBrain, loadCfrModel } from '../cfr/index.ts';
import type { CfrModel, ShippedStrategyKey } from '../cfr/index.ts';
import type { Opponent } from './opponent.ts';
import { readWithProgress } from './progressRead.ts';
import type { WorkerMessage, WorkerRequest } from './workerProtocol.ts';
import type { OpponentLoader } from './workerHandler.ts';
import { createWorkerHandler } from './workerHandler.ts';

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerMessage): void;
}

const scope = self as unknown as WorkerScope;

const STEP = 0.01;

function reporter(opponent: ShippedStrategyKey) {
  let shown = -1;
  return (received: number, total: number) => {
    const share = total > 0 ? received / total : 0;
    if (total > 0 && share < 1 && share - shown < STEP) return;
    shown = share;
    scope.postMessage({ progress: { opponent, received, total } });
  };
}

function reader(opponent: ShippedStrategyKey) {
  const strategy = SHIPPED_STRATEGIES[opponent].url.href;
  const report = reporter(opponent);
  return async (url: URL): Promise<Uint8Array<ArrayBuffer>> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Cannot load ${url.pathname}: ${response.status}`);
    }
    if (url.href !== strategy) {
      return new Uint8Array(await response.arrayBuffer());
    }
    return readWithProgress(response, report);
  };
}

const models = new Map<Opponent, Promise<CfrModel>>();

function cfrModel(opponent: ShippedStrategyKey): Promise<CfrModel> {
  const cached = models.get(opponent);
  if (cached !== undefined) return cached;
  const model = loadCfrModel(SHIPPED_STRATEGIES[opponent].url, reader(opponent));
  models.set(opponent, model);
  model.catch(() => models.delete(opponent));
  return model;
}

const loadOpponent: OpponentLoader = async (opponent, seed) => {
  if (opponent === 'math') throw new Error('The math bot needs no model');
  const loaded = await cfrModel(opponent);
  const rng = mulberry32(seed);
  return () => createCfrBrain(loaded, rng);
};

const handle = createWorkerHandler(
  () => createMathBrain(),
  (reply) => {
    scope.postMessage(reply);
  },
  loadOpponent,
  (opponent) => cfrModel(opponent === 'math' ? 'cfr' : opponent),
);

scope.onmessage = (event) => {
  handle(event.data);
};
