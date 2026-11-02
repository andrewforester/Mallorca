import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { netsOfRecords, pairedDifference } from './paired.ts';

const BIG_BLIND = 20;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { session: { type: 'string', default: '1' } },
});
const session = Number(values.session);
if (positionals.length !== 2 || !Number.isInteger(session) || session < 1) {
  console.error('usage: npm run arena:paired -- [--session <hands>] <first.jsonl> <second.jsonl>');
  process.exit(1);
}

const nets = (path: string) =>
  netsOfRecords(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line)),
    session,
  );

try {
  const [first, second] = positionals as [string, string];
  const result = pairedDifference(nets(first), nets(second), BIG_BLIND, 2 * session);
  const sign = result.mean < 0 ? '-' : '+';
  console.log(
    `second minus first: ${sign}${Math.abs(result.mean).toFixed(1)} ± ${result.ci95.toFixed(1)} bb/100 over ${result.pairs} pairs`,
  );
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
