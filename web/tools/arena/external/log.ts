import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { HandRecord } from '../../../src/game/records/index.ts';

export interface ExternalLine {
  record: HandRecord | null;
  external: {
    opponent: 'slumbot';
    clientPos: 0 | 1;
    action: string;
    holeCards: [string, string];
    board: string[];
    opponentCards: [string, string] | null;
    winnings: number | null;
    baselineWinnings: number | null;
    seed: number;
    handIndex: number;
    abandoned: boolean;
    error: string | null;
  };
}

function parse(text: string): ExternalLine {
  return JSON.parse(text) as ExternalLine;
}

export function readLog(text: string): ExternalLine[] {
  const rows = text.split('\n').filter((row) => row.length > 0);
  const lines: ExternalLine[] = [];
  rows.forEach((row, index) => {
    try {
      lines.push(parse(row));
    } catch (error) {
      if (index < rows.length - 1 || text.endsWith('\n')) throw error;
    }
  });
  return lines;
}

export function openLog(path: string): ExternalLine[] {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf8');
  const lines = readLog(text);
  const clean = lines.map((line) => `${JSON.stringify(line)}\n`).join('');
  if (clean !== text) writeFileSync(path, clean);
  return lines;
}

export function appendLine(path: string, line: ExternalLine): void {
  appendFileSync(path, `${JSON.stringify(line)}\n`);
}
