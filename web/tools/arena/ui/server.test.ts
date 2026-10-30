import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { handsPath, listRuns } from './server.ts';

const base = {
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

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'arena-ui-'));
  writeFileSync(join(dir, 'old.json'), JSON.stringify(base));
  writeFileSync(join(dir, 'old.jsonl'), '{}\n{}\n');
  utimesSync(
    join(dir, 'old.json'),
    new Date('2026-10-24T10:00:00Z'),
    new Date('2026-10-24T10:00:00Z'),
  );
  writeFileSync(
    join(dir, 'new.json'),
    JSON.stringify({ ...base, finishedAt: '2026-10-30T10:00:00.000Z', handsFile: 'h.jsonl' }),
  );
  writeFileSync(join(dir, 'h.jsonl'), '{}\n');
  writeFileSync(
    join(dir, 'gone.json'),
    JSON.stringify({ ...base, finishedAt: '2026-10-29T10:00:00.000Z', handsFile: 'missing.jsonl' }),
  );
  writeFileSync(
    join(dir, 'none.json'),
    JSON.stringify({ ...base, finishedAt: '2026-10-28T10:00:00.000Z', handsFile: null }),
  );
  writeFileSync(join(dir, 'broken.json'), '{"a":');
  writeFileSync(join(dir, 'other.json'), JSON.stringify({ name: 'not a report' }));
  return dir;
}

describe('listRuns', () => {
  it('lists reports newest first and skips files that are not reports', () => {
    const runs = listRuns(fixture());
    expect(runs.map((r) => r.file)).toEqual(['new.json', 'gone.json', 'none.json', 'old.json']);
  });

  it('takes finishedAt and handsFile from a new report', () => {
    const run = listRuns(fixture())[0]!;
    expect(run.report.finishedAt).toBe('2026-10-30T10:00:00.000Z');
    expect(run.handsFile).toBe('h.jsonl');
    expect(run.handsBytes).toBe(3);
  });

  it('falls back to mtime and the same base name for an old report', () => {
    const run = listRuns(fixture()).find((r) => r.file === 'old.json')!;
    expect(run.report.finishedAt).toBe('2026-10-24T10:00:00.000Z');
    expect(run.handsFile).toBe('old.jsonl');
    expect(run.handsBytes).toBe(6);
  });

  it('has no hands when the file is missing or was not saved', () => {
    const runs = listRuns(fixture());
    for (const file of ['gone.json', 'none.json']) {
      const run = runs.find((r) => r.file === file)!;
      expect(run.handsFile).toBeNull();
      expect(run.handsBytes).toBeNull();
    }
  });

  it('is empty for a directory that does not exist', () => {
    expect(listRuns(join(tmpdir(), 'arena-ui-missing-dir-xyz'))).toEqual([]);
  });
});

describe('handsPath', () => {
  it('resolves a hands file of the directory', () => {
    const dir = fixture();
    expect(handsPath(dir, 'h.jsonl')).toBe(join(dir, 'h.jsonl'));
  });

  it('resolves a gzipped hands file', () => {
    const dir = fixture();
    writeFileSync(join(dir, 'p.jsonl.gz'), '');
    expect(handsPath(dir, 'p.jsonl.gz')).toBe(join(dir, 'p.jsonl.gz'));
  });

  it.each(['../h.jsonl', 'a/h.jsonl', 'a\\h.jsonl', 'new.json', 'missing.jsonl', '', '..'])(
    'rejects %j',
    (name) => {
      expect(handsPath(fixture(), name)).toBeNull();
    },
  );
});
