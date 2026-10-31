import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

function gitCommonDir(cwd: string, env: NodeJS.ProcessEnv): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

export function resultsDir(cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  if (env.ARENA_DIR) return resolve(cwd, env.ARENA_DIR);
  const common = gitCommonDir(cwd, env);
  if (common === null) return join(cwd, 'arena-out');
  return join(dirname(common), 'web', 'arena-out');
}

function stamp(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}`;
}

export function runName(a: string, b: string, pairs: number, seed: number, started: Date): string {
  return `${a}-${b}-${pairs}-s${seed}-${stamp(started)}`;
}
