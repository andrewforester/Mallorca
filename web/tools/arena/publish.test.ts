import { mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { publishRun, writeIndex } from './publish.ts';

const report = {
  a: 'cfr',
  b: 'math',
  pairs: 2,
  hands: 4,
  seed: 1,
  bbPer100: 10,
  ci95: 5,
  durationMs: 1,
  commit: 'abc',
};

const HANDS = '{"handNumber":1,"events":[]}\n{"handNumber":2,"events":[]}\n';

function setup() {
  const results = mkdtempSync(join(tmpdir(), 'arena-results-'));
  const published = mkdtempSync(join(tmpdir(), 'arena-published-'));
  writeFileSync(
    join(results, 'new.json'),
    JSON.stringify({ ...report, finishedAt: '2026-10-30T10:00:00.000Z', handsFile: 'new.jsonl' }),
  );
  writeFileSync(join(results, 'new.jsonl'), HANDS);
  writeFileSync(join(results, 'old.json'), JSON.stringify(report));
  utimesSync(
    join(results, 'old.json'),
    new Date('2026-10-24T10:00:00Z'),
    new Date('2026-10-24T10:00:00Z'),
  );
  writeFileSync(
    join(results, 'bare.json'),
    JSON.stringify({ ...report, finishedAt: '2026-10-29T10:00:00.000Z', handsFile: null }),
  );
  return { results, published };
}

function json(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('publishRun', () => {
  it('copies the report and gzips the hands', () => {
    const { results, published } = setup();
    const out = publishRun('new.json', results, published);
    expect(out.name).toBe('new');
    expect(readdirSync(published).sort()).toEqual(['index.json', 'new.json', 'new.jsonl.gz']);
    const copy = json(join(published, 'new.json'));
    expect(copy.handsFile).toBe('new.jsonl.gz');
    expect(copy.finishedAt).toBe('2026-10-30T10:00:00.000Z');
    expect(copy.bbPer100).toBe(10);
    const gz = readFileSync(join(published, 'new.jsonl.gz'));
    expect(gunzipSync(gz).toString('utf8')).toBe(HANDS);
    expect(out.bytes).toBe(gz.length + readFileSync(join(published, 'new.json')).length);
  });

  it('writes the file time of an old report as finishedAt', () => {
    const { results, published } = setup();
    publishRun('old', results, published);
    expect(json(join(published, 'old.json')).finishedAt).toBe('2026-10-24T10:00:00.000Z');
    expect(json(join(published, 'old.json')).handsFile).toBeNull();
  });

  it('publishes a run without hands as a report only', () => {
    const { results, published } = setup();
    publishRun(join(results, 'bare.json'), '/nowhere', published);
    expect(readdirSync(published).sort()).toEqual(['bare.json', 'index.json']);
    expect(json(join(published, 'bare.json')).handsFile).toBeNull();
  });

  it('throws for a run that does not exist', () => {
    const { results, published } = setup();
    expect(() => publishRun('missing', results, published)).toThrow(/no arena report "missing"/);
  });

  it('keeps the index in step with the directory', () => {
    const { results, published } = setup();
    publishRun('new', results, published);
    publishRun('bare', results, published);
    const index = json(join(published, 'index.json'));
    expect(index.map((r: { file: string }) => r.file)).toEqual(['new.json', 'bare.json']);
    expect(index[0].handsFile).toBe('new.jsonl.gz');
  });
});

describe('writeIndex', () => {
  it('lists an empty directory as an empty array', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arena-published-'));
    expect(writeIndex(dir)).toEqual([]);
    expect(readFileSync(join(dir, 'index.json'), 'utf8')).toBe('[]\n');
  });
});
