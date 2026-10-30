import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import type { RunEntry, SavedReport } from './types.ts';

function isReport(value: unknown): value is Omit<SavedReport, 'finishedAt'> {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.a === 'string' &&
    typeof r.b === 'string' &&
    typeof r.pairs === 'number' &&
    typeof r.bbPer100 === 'number'
  );
}

function readReport(path: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isReport(value) ? (value as unknown as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function handsPath(dir: string, name: string): string | null {
  if (!name.endsWith('.jsonl') || /[/\\]/.test(name) || name.includes('..')) return null;
  const path = join(dir, name);
  return existsSync(path) && statSync(path).isFile() ? path : null;
}

function handsName(file: string, raw: Record<string, unknown>): string | null {
  if (raw.handsFile === null) return null;
  if (typeof raw.handsFile === 'string') return raw.handsFile;
  return file.replace(/\.json$/, '.jsonl');
}

function entry(dir: string, file: string): RunEntry | null {
  const path = join(dir, file);
  const raw = readReport(path);
  if (raw === null) return null;
  const finishedAt =
    typeof raw.finishedAt === 'string' ? raw.finishedAt : statSync(path).mtime.toISOString();
  const name = handsName(file, raw);
  const hands = name === null ? null : handsPath(dir, name);
  return {
    file,
    report: { ...(raw as unknown as SavedReport), finishedAt },
    handsFile: hands === null ? null : name,
    handsBytes: hands === null ? null : statSync(hands).size,
  };
}

export function listRuns(dir: string): RunEntry[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => entry(dir, file))
    .filter((run): run is RunEntry => run !== null)
    .sort((x, y) => y.report.finishedAt.localeCompare(x.report.finishedAt));
}

function serveRuns(dir: string, res: ServerResponse): void {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(listRuns(dir)));
}

function serveHands(dir: string, req: IncomingMessage, res: ServerResponse): void {
  const name = new URL(req.url ?? '', 'http://localhost').searchParams.get('file') ?? '';
  const path = handsPath(dir, name);
  if (path === null) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  res.setHeader('Content-Type', 'application/x-ndjson');
  createReadStream(path).pipe(res);
}

export function arenaPlugin(dir: string): Plugin {
  return {
    name: 'arena-results',
    configureServer(server) {
      server.config.logger.info(`  arena results: ${dir}`);
      server.middlewares.use('/api/runs', (_req, res) => serveRuns(dir, res));
      server.middlewares.use('/api/hands', (req, res) => serveHands(dir, req, res));
    },
  };
}
