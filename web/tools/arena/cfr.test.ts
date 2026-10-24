import { describe, expect, it, vi } from 'vitest';
import { BOTS, prepareBots } from './bots.ts';
import { playPair } from './match.ts';
import { runArena } from './run.ts';

describe('the cfr bot in the arena', () => {
  it('cannot play before it is prepared', async () => {
    vi.resetModules();
    const fresh = await import('./bots.ts');
    expect(() => fresh.BOTS.cfr({ next: () => 0 })).toThrow(/prepareBots/);
  });

  it('plays reproducible pairs against the math bot', async () => {
    await prepareBots(['cfr']);
    const first = playPair(BOTS.cfr, BOTS.math, 3, 1);
    expect(first).toEqual(playPair(BOTS.cfr, BOTS.math, 3, 1));
    expect(Number.isInteger(first.net)).toBe(true);
  }, 60_000);

  it('plays reproducible pairs with the solver on', async () => {
    await prepareBots(['cfr-solve']);
    const first = playPair(BOTS['cfr-solve'], BOTS.cfr, 3, 1);
    expect(first).toEqual(playPair(BOTS['cfr-solve'], BOTS.cfr, 3, 1));
  }, 600_000);

  it('runs in worker threads with the same result as in process', async () => {
    const options = { a: 'cfr', b: 'always-call', pairs: 6, seed: 2 };
    const one = await runArena({ ...options, workers: 1 });
    const two = await runArena({ ...options, workers: 2 });
    expect(two.bbPer100).toBe(one.bbPer100);
    expect(one.hands).toBe(12);
  }, 60_000);
});
