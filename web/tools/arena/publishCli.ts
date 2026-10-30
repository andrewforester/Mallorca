import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { resultsDir } from './paths.ts';
import { publishRun, writeIndex } from './publish.ts';

const publishDir = fileURLToPath(new URL('../../arena-results/', import.meta.url));
const { positionals } = parseArgs({ allowPositionals: true });
const from = resultsDir(process.cwd());

try {
  for (const source of positionals) {
    const { name, bytes } = publishRun(source, from, publishDir);
    console.log(`published ${name}: ${(bytes / 1_000_000).toFixed(2)} MB in ${publishDir}`);
  }
  const runs = writeIndex(publishDir);
  console.log(`index lists ${runs.length} runs`);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
