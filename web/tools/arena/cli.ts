import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { BOTS, botLabel, isBotName } from './bots.ts';
import { resultsDir, runName } from './paths.ts';
import { runArena } from './run.ts';

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

function signed(value: number): string {
  const text = Math.abs(value).toFixed(1);
  return value < 0 ? `-${text}` : `+${text}`;
}

const { values } = parseArgs({
  options: {
    a: { type: 'string', default: 'math' },
    b: { type: 'string', default: 'always-call' },
    pairs: { type: 'string', default: '1000' },
    seed: { type: 'string', default: '1' },
    workers: { type: 'string', default: String(availableParallelism()) },
    out: { type: 'string' },
    'save-hands': { type: 'string' },
    dir: { type: 'string' },
    'no-hands': { type: 'boolean', default: false },
    stats: { type: 'boolean', default: false },
  },
});

const names = [...Object.keys(BOTS), 'cfr:<play file>'];
for (const name of [values.a, values.b]) {
  if (!isBotName(name)) {
    console.error(`unknown bot "${name}", choose from: ${names.join(', ')}`);
    process.exit(1);
  }
}

function integerFlag(name: string, raw: string, min: number): number {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(value) || value < min) {
    console.error(`--${name} must be an integer of at least ${min}, got "${raw}"`);
    process.exit(1);
  }
  return value;
}

const pairs = integerFlag('pairs', values.pairs, 1);
const seed = integerFlag('seed', values.seed, 0);
const workers = integerFlag('workers', values.workers, 1);

const dir = values.dir === undefined ? resultsDir(process.cwd()) : resolve(values.dir);
const name = runName(botLabel(values.a), botLabel(values.b), pairs, seed, new Date());
const out = values.out === undefined ? join(dir, `${name}.json`) : resolve(values.out);
const saveHands = values['no-hands']
  ? undefined
  : values['save-hands'] === undefined
    ? join(dir, `${name}.jsonl`)
    : resolve(values['save-hands']);

for (const path of [out, saveHands]) {
  if (path === undefined) continue;
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch (error) {
    console.error(`cannot create ${dirname(path)}: ${(error as Error).message}`);
    process.exit(1);
  }
}

const report = await runArena({
  a: values.a,
  b: values.b,
  pairs,
  seed,
  workers,
  saveHands,
  reportDir: dirname(out),
  stats: values.stats,
});

writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.error(`report ${out}`);

const interval = report.ci95 === null ? 'n/a' : report.ci95.toFixed(1);
console.log(
  `${report.a} vs ${report.b}: ${signed(report.bbPer100)} ± ${interval} bb/100 over ${report.hands} hands in ${Math.round(report.durationMs / 1000)} s`,
);

const style = report.styleStats;
if (style !== undefined) {
  console.log(
    `${report.a} style: vpip ${percent(style.vpip)} pfr ${percent(style.pfr)} af ${style.aggressionFactor.toFixed(2)} bet ${percent(style.betFrequency)} fold to bet ${percent(style.foldToBet)} raise ${percent(style.raiseFrequency)} over ${style.hands} hands, ${style.postflopDecisions} decisions after the flop, ${style.facedBets} facing a bet`,
  );
}
