import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { BotBias } from '../../src/brains/index.ts';
import { createCfrModel, inflate } from '../../src/cfr/index.ts';
import { SHIPPED_STRATEGIES, WASM_URL } from '../../src/cfr/strategies.ts';
import { parseHands } from './parse.ts';
import { AXES, decisionsOf, NEUTRAL } from './replay.ts';
import { report } from './report.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: 'string', default: 'v2' },
    style: { type: 'string' },
    her: { type: 'string' },
  },
});

function styleOf(text: string | undefined): BotBias | undefined {
  if (text === undefined) return undefined;
  const style = { ...NEUTRAL };
  for (const pair of text.split(',')) {
    const [axis, value] = pair.split('=');
    const known = AXES.find((a) => a === axis?.trim());
    if (known === undefined || value === undefined) throw new Error(`unknown axis in "${pair}"`);
    style[known] = Number(value);
  }
  return style;
}

const path = positionals[0] ?? '/dev/stdin';
const text = readFileSync(path, 'utf8');
const strategy = values.model === 'v1' ? SHIPPED_STRATEGIES.cfr : SHIPPED_STRATEGIES['cfr-v2'];
const model = await createCfrModel(
  readFileSync(WASM_URL),
  await inflate(readFileSync(strategy.url)),
);
const style = styleOf(values.style);
const decisions = parseHands(text).flatMap((hand) => {
  const seat = hand.names.indexOf(values.her ?? '');
  return decisionsOf(model, hand, { style, her: seat === 0 || seat === 1 ? seat : undefined });
});
console.log(report(decisions));
