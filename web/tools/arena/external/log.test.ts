import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExternalLine } from './log.ts';
import { appendLine, openLog, readLog } from './log.ts';

function line(handIndex: number): ExternalLine {
  return {
    record: null,
    external: {
      opponent: 'slumbot',
      clientPos: 0,
      action: 'f',
      holeCards: ['Ah', 'Kd'],
      board: [],
      opponentCards: ['2c', '3d'],
      winnings: 50,
      baselineWinnings: 0,
      seed: 1,
      handIndex,
      abandoned: false,
      error: null,
    },
  };
}

describe('readLog', () => {
  it('reads one line per hand', () => {
    const text = `${JSON.stringify(line(0))}\n${JSON.stringify(line(1))}\n`;
    expect(readLog(text).map((l) => l.external.handIndex)).toEqual([0, 1]);
  });

  it('ignores a last line cut in the middle of a write', () => {
    const text = `${JSON.stringify(line(0))}\n{"rec`;
    expect(readLog(text)).toHaveLength(1);
  });

  it('throws on a broken line before the end', () => {
    expect(() => readLog(`{"rec\n${JSON.stringify(line(0))}\n`)).toThrow();
  });
});

describe('openLog and appendLine', () => {
  it('drops a cut last line from the file before appending', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'external-log-')), 'run.jsonl');
    writeFileSync(file, `${JSON.stringify(line(0))}\n{"rec`);
    expect(openLog(file)).toHaveLength(1);
    appendLine(file, line(1));
    expect(readLog(readFileSync(file, 'utf8')).map((l) => l.external.handIndex)).toEqual([0, 1]);
  });

  it('opens a missing file as an empty log', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'external-log-')), 'none.jsonl');
    expect(openLog(file)).toEqual([]);
  });
});
