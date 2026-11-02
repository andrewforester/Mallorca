import type { CfrModel } from './model.ts';
import { createCfrModel, inflate } from './model.ts';

export interface BotRecord {
  id: string;
  version: string;
}

export interface ShippedStrategy {
  url: URL;
  record: BotRecord;
}

export const WASM_URL = new URL('./mallorca.wasm', import.meta.url);

export const SHIPPED_STRATEGIES = {
  cfr: {
    url: new URL('./v1.mlcs.gz', import.meta.url),
    record: { id: 'cfr', version: 'v1-18' },
  },
  'cfr-v2': {
    url: new URL('./v2.mlcs.gz', import.meta.url),
    record: { id: 'cfr', version: 'v2-10' },
  },
} as const satisfies Record<string, ShippedStrategy>;

export type ShippedStrategyKey = keyof typeof SHIPPED_STRATEGIES;

export type ReadBytes = (url: URL) => Promise<Uint8Array<ArrayBuffer>>;

export async function loadCfrModel(strategy: URL, read: ReadBytes): Promise<CfrModel> {
  const [wasm, bytes] = await Promise.all([read(WASM_URL), read(strategy)]);
  return createCfrModel(wasm, await inflate(bytes));
}
