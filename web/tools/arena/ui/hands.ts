import type { HandRecord } from '../../../src/game/records/record.ts';
import { summarize } from './analysis.ts';
import type { HandSummary } from './analysis.ts';

export interface ParsedHands {
  summaries: HandSummary[];
  lines: string[];
  skipped: number;
}

function isRecord(value: unknown): value is HandRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return typeof r.handNumber === 'number' && Array.isArray(r.events);
}

function parse(line: string): HandRecord | null {
  try {
    const value: unknown = JSON.parse(line);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

export function parseHands(text: string): ParsedHands {
  const parsed: ParsedHands = { summaries: [], lines: [], skipped: 0 };
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const record = parse(line);
    if (record === null) {
      parsed.skipped += 1;
      continue;
    }
    parsed.summaries.push(summarize(record, parsed.lines.length));
    parsed.lines.push(line);
  }
  return parsed;
}
