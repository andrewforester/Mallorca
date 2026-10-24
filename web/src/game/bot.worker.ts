import { createMathBrain, randomVillainModel } from '../brains/index.ts';
import { mulberry32 } from '../cards/index.ts';
import { BROWSER_SOLVER, createCfrBrain, createCfrModel, inflate } from '../cfr/index.ts';
import type { CfrModel } from '../cfr/index.ts';
import type { WorkerReply, WorkerRequest } from './workerProtocol.ts';
import type { OpponentLoader } from './workerHandler.ts';
import { createWorkerHandler } from './workerHandler.ts';

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(reply: WorkerReply): void;
}

const scope = self as unknown as WorkerScope;

const WASM = new URL('../cfr/mallorca.wasm', import.meta.url);
const STRATEGY = new URL('../cfr/v1.mlcs.gz', import.meta.url);

async function bytes(url: URL): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cannot load ${url.pathname}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

let model: Promise<CfrModel> | null = null;

function cfrModel(): Promise<CfrModel> {
  model ??= Promise.all([bytes(WASM), bytes(STRATEGY)]).then(async ([wasm, strategy]) =>
    createCfrModel(wasm, await inflate(strategy)),
  );
  model.catch(() => {
    model = null;
  });
  return model;
}

const loadOpponent: OpponentLoader = async (_opponent, seed) => {
  const loaded = await cfrModel();
  const rng = mulberry32(seed);
  return () => createCfrBrain(loaded, rng, { solver: BROWSER_SOLVER });
};

const handle = createWorkerHandler(
  () => createMathBrain({ villainModel: randomVillainModel }),
  (reply) => {
    scope.postMessage(reply);
  },
  loadOpponent,
);

scope.onmessage = (event) => {
  handle(event.data);
};
