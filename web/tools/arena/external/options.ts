import { parseArgs } from 'node:util';
import { isBotName } from '../bots.ts';

export type ExternalArgs =
  | {
      mode: 'play';
      opponent: 'slumbot';
      hands: number;
      strategy: string;
      seed: number;
      out: string | null;
      resume: string | null;
      delayMs: number;
    }
  | { mode: 'report'; file: string };

function integer(name: string, raw: string, min: number): number {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(value) || value < min) {
    throw new Error(`--${name} must be an integer of at least ${min}, got "${raw}"`);
  }
  return value;
}

export function parseExternalArgs(argv: string[]): ExternalArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      opponent: { type: 'string', default: 'slumbot' },
      hands: { type: 'string', default: '1000' },
      strategy: { type: 'string', default: 'cfr' },
      seed: { type: 'string', default: '1' },
      out: { type: 'string' },
      resume: { type: 'string' },
      'delay-ms': { type: 'string', default: '200' },
      report: { type: 'string' },
    },
  });
  if (values.report !== undefined) return { mode: 'report', file: values.report };
  if (values.opponent !== 'slumbot') {
    throw new Error(`unknown opponent "${values.opponent}", the only one is slumbot`);
  }
  if (!isBotName(values.strategy)) throw new Error(`unknown bot "${values.strategy}"`);
  return {
    mode: 'play',
    opponent: 'slumbot',
    hands: integer('hands', values.hands, 1),
    strategy: values.strategy,
    seed: integer('seed', values.seed, 0),
    out: values.out ?? null,
    resume: values.resume ?? null,
    delayMs: integer('delay-ms', values['delay-ms'], 0),
  };
}
