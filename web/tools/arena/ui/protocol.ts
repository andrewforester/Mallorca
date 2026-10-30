import type { HandRecord } from '../../../src/game/records/record.ts';
import type { HandSummary } from './analysis.ts';

export type WorkerRequest =
  { type: 'load'; file: string } | { type: 'record'; id: number; line: number };

export type WorkerResponse =
  | { type: 'loaded'; summaries: HandSummary[]; skipped: number }
  | { type: 'failed'; message: string }
  | { type: 'record'; id: number; record: HandRecord };
