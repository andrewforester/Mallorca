import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runArena, runInWorker } from './run.ts';

const webDir = fileURLToPath(new URL('../../', import.meta.url));

function cli(args: string[]) {
  return spawnSync('node', ['tools/arena/cli.ts', ...args], { cwd: webDir, encoding: 'utf8' });
}

describe('arena cli', () => {
  it('one worker and four workers give the same report', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arena-'));
    const base = [
      '--a',
      'always-call',
      '--b',
      'always-raise',
      '--pairs',
      '8',
      '--seed',
      '4',
      '--dir',
      dir,
    ];
    const one = cli([...base, '--workers', '1', '--out', join(dir, 'a.json')]);
    const four = cli([...base, '--workers', '4', '--out', join(dir, 'b.json')]);
    expect(one.status).toBe(0);
    expect(four.status).toBe(0);
    const x = JSON.parse(readFileSync(join(dir, 'a.json'), 'utf8'));
    const y = JSON.parse(readFileSync(join(dir, 'b.json'), 'utf8'));
    expect(x.bbPer100).toBe(y.bbPer100);
    expect(x.ci95).toBe(y.ci95);
    expect(x.hands).toBe(16);
    expect(one.stdout).toMatch(
      /^always-call vs always-raise: [+-]\d+\.\d ± \d+\.\d bb\/100 over 16 hands in \d+ s\n$/,
    );
  });

  it('an unknown bot exits with 1 and lists the bots', () => {
    const r = cli(['--a', 'nope']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('always-call');
  });

  it('save-hands writes one JSON record per hand', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arena-'));
    const file = join(dir, 'hands.jsonl');
    const r = cli([
      '--a',
      'always-call',
      '--b',
      'always-raise',
      '--pairs',
      '8',
      '--seed',
      '4',
      '--workers',
      '2',
      '--save-hands',
      file,
      '--dir',
      dir,
    ]);
    expect(r.status).toBe(0);
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(16);
    const first = JSON.parse(lines[0]!);
    expect(first.sessionId).toBe('arena-4');
    expect(first.humanSeat).toBeNull();
    expect(first.names).toEqual(['always-call', 'always-raise']);
    expect(JSON.parse(lines[1]!).names).toEqual(['always-raise', 'always-call']);
  });
});

describe('default output', () => {
  const base = ['--a', 'always-call', '--b', 'always-raise', '--pairs', '4', '--seed', '3'];

  it('saves the report and the hands under --dir with the run name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arena-'));
    const r = cli([...base, '--dir', dir]);
    expect(r.status).toBe(0);
    const files = readdirSync(dir).sort();
    expect(files).toHaveLength(2);
    expect(files[0]).toMatch(/^always-call-always-raise-4-s3-\d{8}-\d{6}\.json$/);
    expect(files[1]).toBe(files[0]!.replace(/\.json$/, '.jsonl'));
    const report = JSON.parse(readFileSync(join(dir, files[0]!), 'utf8'));
    expect(report.handsFile).toBe(files[1]);
    expect(Number.isNaN(Date.parse(report.finishedAt))).toBe(false);
    expect(readFileSync(join(dir, files[1]!), 'utf8').trim().split('\n')).toHaveLength(8);
  });

  it('--no-hands saves only the report', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arena-'));
    expect(cli([...base, '--dir', dir, '--no-hands']).status).toBe(0);
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(dir, files[0]!), 'utf8')).handsFile).toBeNull();
  });

  it('--out and --save-hands write exactly those paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arena-'));
    const other = mkdtempSync(join(tmpdir(), 'arena-'));
    const out = join(other, 'r.json');
    const hands = join(other, 'h.jsonl');
    expect(cli([...base, '--dir', dir, '--out', out, '--save-hands', hands]).status).toBe(0);
    expect(readdirSync(dir)).toEqual([]);
    expect(readdirSync(other).sort()).toEqual(['h.jsonl', 'r.json']);
    expect(JSON.parse(readFileSync(out, 'utf8')).handsFile).toBe('h.jsonl');
  });
});

describe('numeric flags', () => {
  it.each([
    ['--pairs', 'abc'],
    ['--pairs', '0'],
    ['--pairs', '-5'],
    ['--pairs', '2.5'],
    ['--workers', 'abc'],
    ['--workers', '0'],
    ['--seed', '-1'],
    ['--seed', '1.5'],
  ])('%s %s exits with 1', (flag, value) => {
    const r = cli([flag, value]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(flag);
    expect(r.stdout).toBe('');
  });
});

describe('runArena', () => {
  it('rejects an unknown bot', async () => {
    await expect(runArena({ a: 'nope', b: 'math', pairs: 2, seed: 1, workers: 1 })).rejects.toThrow(
      /unknown bot "nope"/,
    );
  });

  it('rejects when a worker throws', async () => {
    await expect(
      runInWorker({ a: 'nope' as 'math', b: 'math', seed: 1, indices: [0], withHands: false }),
    ).rejects.toThrow();
  });

  it('saves hands with distinct playedAt so hand numbers do not collide', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'arena-')), 'hands.jsonl');
    await runArena({
      a: 'always-raise',
      b: 'always-call',
      pairs: 4,
      seed: 1,
      workers: 1,
      saveHands: file,
    });
    const records = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { playedAt: string });
    expect(records).toHaveLength(8);
    expect(new Set(records.map((r) => r.playedAt)).size).toBe(8);
    const times = records.map((r) => Date.parse(r.playedAt));
    expect(times.map((t) => t - times[0]!)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((n) => n * 1000));
  });

  it('runs in process', async () => {
    const report = await runArena({ a: 'math', b: 'always-call', pairs: 20, seed: 1, workers: 1 });
    expect(report.hands).toBe(40);
    expect(Number.isFinite(report.bbPer100)).toBe(true);
  }, 120_000);
});
