import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { SHIPPED_STRATEGIES, WASM_URL, loadCfrModel } from './strategies.ts';

describe('SHIPPED_STRATEGIES', () => {
  it('names each shipped blueprint with its file and the id written into hand records', () => {
    expect(Object.keys(SHIPPED_STRATEGIES)).toEqual(['cfr', 'cfr-v2']);
    expect(SHIPPED_STRATEGIES.cfr.record).toEqual({ id: 'cfr', version: 'v1-18' });
    expect(SHIPPED_STRATEGIES['cfr-v2'].record).toEqual({ id: 'cfr', version: 'v2-10' });
    expect(SHIPPED_STRATEGIES.cfr.url.pathname).toMatch(/\/src\/cfr\/v1\.mlcs\.gz$/);
    expect(SHIPPED_STRATEGIES['cfr-v2'].url.pathname).toMatch(/\/src\/cfr\/v2\.mlcs\.gz$/);
    expect(WASM_URL.pathname).toMatch(/\/src\/cfr\/mallorca\.wasm$/);
  });
});

describe('loadCfrModel', () => {
  it('reads the module and the strategy through the given reader', async () => {
    const read: URL[] = [];
    const model = await loadCfrModel(SHIPPED_STRATEGIES.cfr.url, (url) => {
      read.push(url);
      return readFile(url);
    });
    expect(read.map((u) => u.href).sort()).toEqual(
      [WASM_URL.href, SHIPPED_STRATEGIES.cfr.url.href].sort(),
    );
    model.newBot().free();
  });

  it('rejects with the reader error', async () => {
    const failing = (): Promise<never> => Promise.reject(new Error('offline'));
    await expect(loadCfrModel(SHIPPED_STRATEGIES.cfr.url, failing)).rejects.toThrow('offline');
  });
});
