import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { netsOfRecords, pairedDifference } from './paired.ts';

const BIG_BLIND = 20;

const { positionals } = parseArgs({ allowPositionals: true });
if (positionals.length !== 2) {
  console.error('usage: npm run arena:paired -- <first.jsonl> <second.jsonl>');
  process.exit(1);
}

const nets = (path: string) =>
  netsOfRecords(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line)),
  );

try {
  const [first, second] = positionals as [string, string];
  const result = pairedDifference(nets(first), nets(second), BIG_BLIND);
  const sign = result.mean < 0 ? '-' : '+';
  console.log(
    `second minus first: ${sign}${Math.abs(result.mean).toFixed(1)} ± ${result.ci95.toFixed(1)} bb/100 over ${result.pairs} pairs`,
  );
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
