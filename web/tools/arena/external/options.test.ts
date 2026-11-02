import { describe, expect, it } from 'vitest';
import { parseExternalArgs } from './options.ts';

describe('parseExternalArgs', () => {
  it('fills the defaults of a play run', () => {
    expect(parseExternalArgs([])).toEqual({
      mode: 'play',
      opponent: 'slumbot',
      hands: 1000,
      strategy: 'cfr',
      seed: 1,
      out: null,
      resume: null,
      delayMs: 200,
    });
  });

  it('reads every play flag', () => {
    const args = parseExternalArgs([
      '--strategy',
      'cfr:/x/v2-10-play.mlcs',
      '--hands',
      '20',
      '--seed',
      '3',
      '--resume',
      'run.jsonl',
      '--delay-ms',
      '0',
    ]);
    expect(args).toMatchObject({
      strategy: 'cfr:/x/v2-10-play.mlcs',
      hands: 20,
      seed: 3,
      resume: 'run.jsonl',
      delayMs: 0,
    });
  });

  it('switches to the report of a log', () => {
    expect(parseExternalArgs(['--report', 'run.jsonl'])).toEqual({
      mode: 'report',
      file: 'run.jsonl',
    });
  });

  it('rejects an unknown opponent, a bad number and an unknown bot', () => {
    expect(() => parseExternalArgs(['--opponent', 'pluribus'])).toThrow(/opponent/);
    expect(() => parseExternalArgs(['--hands', '0'])).toThrow(/hands/);
    expect(() => parseExternalArgs(['--hands', '1.5'])).toThrow(/hands/);
    expect(() => parseExternalArgs(['--strategy', 'nobody'])).toThrow(/bot/);
  });
});
