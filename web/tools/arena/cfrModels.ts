import { readFile } from 'node:fs/promises';
import type { Rng } from '../../src/cards/index.ts';
import type { CfrBrain, CfrModel, ShippedStrategyKey } from '../../src/cfr/index.ts';
import { createCfrBrain, loadCfrModel } from '../../src/cfr/index.ts';

export const SHIPPED: ShippedStrategyKey = 'cfr';

const models = new Map<string, CfrModel>();
const read = (url: URL) => readFile(url);

export function cfrBrainOf(key: string, rng: Rng): CfrBrain {
  const model = models.get(key);
  if (model === undefined) {
    throw new Error('The cfr bot needs prepareBots before it plays');
  }
  return createCfrBrain(model, rng);
}

export async function prepareModel(key: string, url: URL): Promise<void> {
  if (!models.has(key)) models.set(key, await loadCfrModel(url, read));
}
