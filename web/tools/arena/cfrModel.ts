import { readFile } from 'node:fs/promises';
import type { CfrModel } from '../../src/cfr/index.ts';
import { createCfrModel, inflate } from '../../src/cfr/index.ts';

const WASM = new URL('../../src/cfr/mallorca.wasm', import.meta.url);
const STRATEGY = new URL('../../src/cfr/v1.mlcs.gz', import.meta.url);

export async function loadCfrModel(path: string | URL = STRATEGY): Promise<CfrModel> {
  const [wasm, strategy] = await Promise.all([readFile(WASM), readFile(path)]);
  return createCfrModel(wasm, await inflate(strategy));
}
