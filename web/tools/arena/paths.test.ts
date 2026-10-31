import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resultsDir, runName } from './paths.ts';

const webDir = fileURLToPath(new URL('../../', import.meta.url));

describe('resultsDir', () => {
  it('ARENA_DIR wins, resolved against cwd', () => {
    expect(resultsDir('/tmp/x', { ARENA_DIR: 'runs' })).toBe('/tmp/x/runs');
    expect(resultsDir('/tmp/x', { ARENA_DIR: '/abs/runs' })).toBe('/abs/runs');
  });

  it('inside a checkout it is web/arena-out of the main checkout', () => {
    const common = execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      {
        cwd: webDir,
        encoding: 'utf8',
      },
    ).trim();
    expect(resultsDir(webDir, { ...process.env, ARENA_DIR: '' })).toBe(
      join(dirname(common), 'web', 'arena-out'),
    );
  });

  it('outside git it is arena-out under cwd', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arena-nogit-'));
    expect(
      resultsDir(dir, { ...process.env, ARENA_DIR: '', GIT_CEILING_DIRECTORIES: dirname(dir) }),
    ).toBe(join(dir, 'arena-out'));
  });
});

describe('runName', () => {
  it('names a run by bots, pairs, seed and UTC start', () => {
    expect(runName('cfr', 'math', 2000, 2, new Date('2026-10-30T09:15:07Z'))).toBe(
      'cfr-math-2000-s2-20261030-091507',
    );
  });
});
