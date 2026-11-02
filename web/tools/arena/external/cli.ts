import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { botFactory, botLabel, prepareBots } from '../bots.ts';
import { resultsDir, runName } from '../paths.ts';
import { commitHash } from '../run.ts';
import { estimate, formatEstimate } from './estimate.ts';
import { openLog, readLogFile } from './log.ts';
import type { ExternalArgs } from './options.ts';
import { parseExternalArgs } from './options.ts';
import { runExternal } from './runner.ts';
import { createSlumbotClient } from './slumbot/client.ts';

function credentials(): { username: string; password: string } | undefined {
  const username = process.env.SLUMBOT_USERNAME;
  const password = process.env.SLUMBOT_PASSWORD;
  return username && password ? { username, password } : undefined;
}

function report(file: string): void {
  const lines = readLogFile(file);
  const strategy = lines.find((line) => line.record !== null)?.record?.bot.version ?? 'unknown';
  const result = estimate(lines);
  const out = file.replace(/\.jsonl$/, '') + '.json';
  const body = {
    opponent: 'slumbot',
    strategy,
    stackBb: 200,
    ...result,
    commit: commitHash(),
    handsFile: file.split('/').at(-1),
  };
  writeFileSync(out, JSON.stringify(body, null, 2) + '\n');
  console.error(`report ${out}`);
  const share = result.abandoned / Math.max(1, result.hands + result.abandoned);
  if (share > 0.005) {
    console.error(`warning: ${result.abandoned} abandoned hands, ${(share * 100).toFixed(1)}%`);
  }
  console.log(formatEstimate(strategy, result));
}

async function play(args: Extract<ExternalArgs, { mode: 'play' }>): Promise<string> {
  const label = botLabel(args.strategy);
  const name = runName(label, 'slumbot', args.hands, args.seed, new Date());
  const out = resolve(args.resume ?? args.out ?? join(resultsDir(process.cwd()), `${name}.jsonl`));
  mkdirSync(dirname(out), { recursive: true });
  const lines = openLog(out);
  const other = lines.find((line) => line.record !== null && line.record.bot.version !== label);
  if (other !== undefined) {
    throw new Error(`${out} was played by ${other.record?.bot.version}, not ${label}`);
  }
  if (lines.some((line) => line.external.seed !== args.seed)) {
    throw new Error(`${out} was played with another seed than ${args.seed}`);
  }
  await prepareBots([args.strategy]);
  console.error(`hands ${out}`);
  const result = await runExternal({
    client: createSlumbotClient({ fetch, credentials: credentials() }),
    bot: botFactory(args.strategy),
    botVersion: label,
    hands: args.hands,
    seed: args.seed,
    out,
    delayMs: args.delayMs,
    sessionId: `external-${name}`,
  });
  console.error(`played ${result.played}, abandoned ${result.abandoned}`);
  return out;
}

try {
  const args = parseExternalArgs(process.argv.slice(2));
  report(args.mode === 'report' ? resolve(args.file) : await play(args));
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
