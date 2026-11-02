import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { netsOfRecords, pairedDifference, sessionOfHands } from './paired.ts';

const record = (handNumber: number, start: [number, number], end: [number, number]) => ({
  handNumber,
  events: [
    { type: 'handStarted', stacks: start },
    { type: 'handEnded', stacks: end },
  ],
});

describe('netsOfRecords', () => {
  it('sums bot A over both hands of a pair, seat 0 first and seat 1 second', () => {
    const nets = netsOfRecords([
      record(1, [2000, 2000], [2100, 1900]),
      record(2, [2000, 2000], [2040, 1960]),
      record(3, [2000, 2000], [1980, 2020]),
      record(4, [2000, 2000], [1990, 2010]),
    ]);
    expect([...nets]).toEqual([
      [0, 60],
      [1, -10],
    ]);
  });
});

describe('netsOfRecords of sessions', () => {
  it('sums bot A over both sessions of a pair', () => {
    const nets = netsOfRecords(
      [
        record(1, [2000, 2000], [2100, 1900]),
        record(3, [2000, 2000], [2010, 1990]),
        record(2, [2000, 2000], [2040, 1960]),
        record(4, [2000, 2000], [2000, 2000]),
        record(5, [2000, 2000], [1980, 2020]),
        record(7, [2000, 2000], [2000, 2000]),
        record(6, [2000, 2000], [1990, 2010]),
        record(8, [2000, 2000], [2000, 2000]),
      ],
      2,
    );
    expect([...nets]).toEqual([
      [0, 70],
      [1, -10],
    ]);
  });
});

describe('pairedDifference', () => {
  it('gives the mean of b minus a per pair in bb/100 and 1.96 sd over root pairs', () => {
    const a = new Map([
      [0, 0],
      [1, 40],
      [2, -40],
      [3, 0],
    ]);
    const b = new Map([
      [0, 40],
      [1, 40],
      [2, 0],
      [3, 0],
    ]);
    const result = pairedDifference(a, b, 20);
    expect(result.pairs).toBe(4);
    expect(result.mean).toBe(50);
    expect(result.ci95).toBeCloseTo((1.96 * Math.sqrt(10000 / 3)) / 2, 9);
  });

  it('matches pairs by index, not by order', () => {
    const a = new Map([
      [1, 40],
      [0, 0],
    ]);
    const b = new Map([
      [0, 40],
      [1, 80],
    ]);
    expect(pairedDifference(a, b, 20).mean).toBe(100);
    expect(pairedDifference(a, b, 20).ci95).toBe(0);
  });

  it('rejects runs whose pairs differ', () => {
    expect(() => pairedDifference(new Map([[0, 0]]), new Map([[1, 0]]), 20)).toThrow(/pair 0/);
    expect(() =>
      pairedDifference(
        new Map([[0, 0]]),
        new Map([
          [0, 0],
          [1, 0],
        ]),
        20,
      ),
    ).toThrow(/pairs/);
  });
});

describe('pairedDifference of sessions', () => {
  it('counts every hand of a session pair', () => {
    const a = new Map([
      [0, 0],
      [1, 0],
    ]);
    const b = new Map([
      [0, 400],
      [1, 0],
    ]);
    expect(pairedDifference(a, b, 20, 400).mean).toBe(2.5);
  });
});

describe('sessionOfHands', () => {
  it('reads the session length from the report next to the hands', () => {
    const dir = mkdtempSync(join(tmpdir(), 'paired-'));
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ session: 200 }));
    writeFileSync(join(dir, 'old.json'), JSON.stringify({ pairs: 2 }));
    expect(sessionOfHands(join(dir, 'run.jsonl'))).toBe(200);
    expect(sessionOfHands(join(dir, 'old.jsonl'))).toBe(1);
    expect(sessionOfHands(join(dir, 'lonely.jsonl'))).toBe(1);
  });
});
