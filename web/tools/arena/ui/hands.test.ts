import { describe, expect, it } from 'vitest';
import { CASH } from '../../../src/engine/index.ts';
import { handRecord } from '../../../src/game/records/record.ts';
import { BOTS } from '../bots.ts';
import { playPair } from '../match.ts';
import { parseHands } from './hands.ts';

function jsonl(pairs: number): string {
  const lines: string[] = [];
  for (let index = 0; index < pairs; index++) {
    playPair(BOTS['always-call'], BOTS['always-raise'], 4, index).hands.forEach((events, k) => {
      const names: [string, string] =
        k === 0 ? ['always-call', 'always-raise'] : ['always-raise', 'always-call'];
      const record = handRecord(events, [], {
        sessionId: 'arena-4',
        mode: CASH,
        names,
        humanSeat: null,
        bot: { id: 'x', version: '1' },
        playedAt: '2026-10-30T00:00:00.000Z',
      });
      lines.push(JSON.stringify(record));
    });
  }
  return lines.join('\n') + '\n';
}

describe('parseHands', () => {
  it('summarizes every line and keeps the raw lines', () => {
    const parsed = parseHands(jsonl(3));
    expect(parsed.summaries).toHaveLength(6);
    expect(parsed.lines).toHaveLength(6);
    expect(parsed.skipped).toBe(0);
    expect(parsed.summaries.map((s) => s.line)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(JSON.parse(parsed.lines[3]!).handNumber).toBe(4);
  });

  it('skips a truncated last line and counts it', () => {
    const text = jsonl(2);
    const parsed = parseHands(text.slice(0, text.length - 40));
    expect(parsed.summaries).toHaveLength(3);
    expect(parsed.skipped).toBe(1);
  });

  it('skips lines that are JSON but not hand records', () => {
    const parsed = parseHands('{}\n[1]\n\n');
    expect(parsed.summaries).toEqual([]);
    expect(parsed.skipped).toBe(2);
  });
});
