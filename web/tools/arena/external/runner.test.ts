import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOTS } from '../bots.ts';
import probe from './fixtures/slumbot-probe.json' with { type: 'json' };
import { readLog } from './log.ts';
import { MirrorError } from './mirror.ts';
import { runExternal, WinningsMismatch } from './runner.ts';
import type { SlumbotClient, SlumbotState } from './slumbot/client.ts';
import { AbandonedHand } from './slumbot/client.ts';

type Step = { req: string; res: Record<string, unknown> };

function replay(hands: Step[][], failures: { hand: number; step: number }[] = []): SlumbotClient {
  let hand = -1;
  let step = 0;
  return {
    async newHand() {
      hand += 1;
      step = 0;
      const steps = hands[hand % hands.length] as Step[];
      return steps[0]?.res as unknown as SlumbotState;
    },
    async act(incr) {
      step += 1;
      if (failures.some((f) => f.hand === hand && f.step === step)) throw new AbandonedHand('lost');
      const steps = hands[hand % hands.length] as Step[];
      const expected = steps[step];
      if (expected?.req !== incr) throw new Error(`expected ${expected?.req}, got ${incr}`);
      return expected.res as unknown as SlumbotState;
    },
  };
}

function tempLog(): string {
  return join(mkdtempSync(join(tmpdir(), 'external-run-')), 'run.jsonl');
}

const options = {
  bot: BOTS['always-call'],
  botVersion: 'always-call',
  seed: 1,
  delayMs: 0,
  sessionId: 'external-test',
  sleep: async () => undefined,
};

describe('runExternal', () => {
  it('plays the six live hands and logs them', async () => {
    const out = tempLog();
    const result = await runExternal({ ...options, client: replay(probe), hands: 6, out });
    expect(result).toEqual({ played: 6, abandoned: 0 });
    const lines = readLog(readFileSync(out, 'utf8'));
    expect(lines.map((l) => l.external.winnings)).toEqual([-800, -100, 50, 200, 200, 100]);
    expect(lines.map((l) => l.external.baselineWinnings)).toEqual([-600, 300, 0, -2200, 0, -300]);
    expect(lines.map((l) => l.external.clientPos)).toEqual([0, 1, 0, 1, 0, 1]);
    expect(lines[0]?.external.opponentCards).toEqual(['Ac', '3s']);
    expect(lines[0]?.record?.holeCards).toEqual([
      ['Td', '4s'],
      ['Ac', '3s'],
    ]);
    expect(lines[0]?.record?.events.at(-1)?.type).toBe('handEnded');
    expect(lines.every((l) => !l.external.abandoned && l.external.error === null)).toBe(true);
  });

  it('stops and logs the hand when the winnings disagree with the mirror', async () => {
    const broken = structuredClone(probe) as Step[][];
    const last = broken[2]?.at(-1) as Step;
    last.res.winnings = 150;
    const out = tempLog();
    await expect(
      runExternal({ ...options, client: replay(broken), hands: 6, out }),
    ).rejects.toThrow(WinningsMismatch);
    const lines = readLog(readFileSync(out, 'utf8'));
    expect(lines).toHaveLength(3);
    expect(lines[2]?.external.abandoned).toBe(true);
    expect(lines[2]?.external.error).toMatch(/winnings/);
  });

  it('stops and logs the hand when the mirror cannot follow Slumbot', async () => {
    const broken = structuredClone(probe) as Step[][];
    const step = broken[0]?.[1] as Step;
    step.res.action = 'b200c/b50';
    const out = tempLog();
    await expect(
      runExternal({ ...options, client: replay(broken), hands: 6, out }),
    ).rejects.toThrow(MirrorError);
    const lines = readLog(readFileSync(out, 'utf8'));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.external.action).toBe('b200c/b50');
    expect(lines[0]?.external.error).toMatch(/b50|raise|illegal/i);
  });

  it('logs an abandoned hand and goes on', async () => {
    const out = tempLog();
    const client = replay(probe, [{ hand: 0, step: 2 }]);
    const result = await runExternal({ ...options, client, hands: 2, out });
    expect(result).toEqual({ played: 1, abandoned: 1 });
    const lines = readLog(readFileSync(out, 'utf8'));
    expect(lines.map((l) => l.external.abandoned)).toEqual([true, false]);
    expect(lines[0]?.record).toBeNull();
  });

  it('stops after ten abandoned hands in a row', async () => {
    const withActs = probe.filter((hand) => hand.length > 1);
    const failures = Array.from({ length: 10 }, (_, hand) => ({ hand, step: 1 }));
    const out = tempLog();
    await expect(
      runExternal({ ...options, client: replay(withActs, failures), hands: 20, out }),
    ).rejects.toThrow(/ten hands/);
  });

  it('resumes the hand numbering from the log', async () => {
    const out = tempLog();
    await runExternal({ ...options, client: replay(probe), hands: 3, out });
    await runExternal({ ...options, client: replay(probe.slice(3)), hands: 3, out });
    const lines = readLog(readFileSync(out, 'utf8'));
    expect(lines.map((l) => l.external.handIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(lines.map((l) => l.record?.handNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
