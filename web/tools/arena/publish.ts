import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { listRuns, readRun } from './ui/server.ts';
import type { RunEntry } from './ui/types.ts';

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

function locate(source: string, resultsDir: string): string {
  if (existsSync(source) && statSync(source).isFile()) return source;
  const path = join(resultsDir, source.endsWith('.json') ? source : `${source}.json`);
  if (!existsSync(path)) throw new Error(`no arena report "${source}" in ${resultsDir}`);
  return path;
}

export function writeIndex(publishDir: string): RunEntry[] {
  mkdirSync(publishDir, { recursive: true });
  const runs = listRuns(publishDir);
  writeJson(join(publishDir, 'index.json'), runs);
  return runs;
}

export function publishRun(
  source: string,
  resultsDir: string,
  publishDir: string,
): { name: string; bytes: number } {
  const path = locate(source, resultsDir);
  const run = readRun(dirname(path), basename(path));
  if (run === null) throw new Error(`${path} is not an arena report`);
  const name = basename(path, '.json');
  const handsFile = run.handsFile === null ? null : `${name}.jsonl.gz`;
  mkdirSync(publishDir, { recursive: true });
  let bytes = 0;
  if (run.handsFile !== null && handsFile !== null) {
    const gz = gzipSync(readFileSync(join(dirname(path), run.handsFile)), { level: 9 });
    writeFileSync(join(publishDir, handsFile), gz);
    bytes += gz.length;
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const reportPath = join(publishDir, `${name}.json`);
  writeJson(reportPath, { ...raw, finishedAt: run.report.finishedAt, handsFile });
  bytes += statSync(reportPath).size;
  writeIndex(publishDir);
  return { name, bytes };
}
