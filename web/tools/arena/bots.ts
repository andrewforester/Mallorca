import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Action } from '../../src/engine/index.ts';
import { checkOrCall } from '../../src/engine/index.ts';
import type { BotBias, Brain } from '../../src/brains/index.ts';
import { createMathBrain } from '../../src/brains/index.ts';
import type { Rng } from '../../src/cards/index.ts';
import type { CfrModel, ShippedStrategyKey } from '../../src/cfr/index.ts';
import { SHIPPED_STRATEGIES, createCfrBrain, loadCfrModel } from '../../src/cfr/index.ts';
import { strengthOf } from '../../src/persona/index.ts';
import type { ArenaBot } from './arenaBot.ts';
import { createExploiter } from './exploiter.ts';
import { createReader } from './reader.ts';
import { createTalkingBot } from './talking.ts';

export type { ArenaBot } from './arenaBot.ts';

export type BotFactory = (rng: Rng) => ArenaBot;

export function fromBrain(brain: Brain): ArenaBot {
  return {
    observe: (o) => brain.observe(o),
    decide: (legal) => brain.decide(legal).action,
    dispose: () => brain.dispose?.(),
  };
}

const math: BotFactory = () => fromBrain(createMathBrain());

const alwaysCall: BotFactory = () => ({
  observe: () => undefined,
  decide: checkOrCall,
});

const alwaysRaise: BotFactory = () => ({
  observe: () => undefined,
  decide: (legal) => (legal.raise ? { kind: 'raise', to: legal.raise.min } : checkOrCall(legal)),
});

const minBettor: BotFactory = () => ({
  observe: () => undefined,
  decide: (legal) =>
    legal.call === null && legal.raise
      ? { kind: 'raise', to: legal.raise.min }
      : checkOrCall(legal),
});

const random: BotFactory = (rng) => ({
  observe: () => undefined,
  decide: (legal) => {
    const options: Action[] = [];
    if (legal.fold) options.push({ kind: 'fold' });
    if (legal.check) options.push({ kind: 'check' });
    if (legal.call !== null) options.push({ kind: 'call' });
    if (legal.raise) options.push({ kind: 'raise', to: legal.raise.min });
    return options[Math.floor(rng.next() * options.length)] ?? checkOrCall(legal);
  },
});

const CFR_FILE = 'cfr:';
const SHIPPED: ShippedStrategyKey = 'cfr';
const cfrModels = new Map<string, CfrModel>();
const read = (url: URL) => readFile(url);

function cfrBot(key: string, bias?: BotBias): BotFactory {
  return (rng) => {
    const model = cfrModels.get(key);
    if (model === undefined) {
      throw new Error('The cfr bot needs prepareBots before it plays');
    }
    const brain = createCfrBrain(model, rng);
    if (bias) brain.setBias?.(bias);
    return fromBrain(brain);
  };
}

const cfr = cfrBot(SHIPPED);

const biased = (bias: Omit<BotBias, 'sizing' | 'stickiness'>): BotFactory =>
  cfrBot(SHIPPED, { ...bias, sizing: 1, stickiness: 1 / bias.tightness });

const talking =
  (mask: number): BotFactory =>
  (rng) =>
    createTalkingBot(cfr(rng), mask, rng);

const reader: BotFactory = (rng) => createReader(math(rng));

const tiltExploiter: BotFactory = (rng) =>
  createExploiter(math(rng), (hole, board) => strengthOf(hole, board, rng));

export const BOTS: Record<
  | 'math'
  | 'cfr'
  | 'cfr-tilted'
  | 'cfr-confident'
  | 'cfr-cautious'
  | 'cfr-talk-obvious'
  | 'cfr-talk-subtle'
  | 'cfr-talk-hidden'
  | 'reader'
  | 'tilt-exploiter'
  | 'always-call'
  | 'always-raise'
  | 'min-bettor'
  | 'random',
  BotFactory
> = {
  math,
  cfr,
  'cfr-tilted': biased({ aggression: 1.6, bluff: 1.8, tightness: 0.85 }),
  'cfr-confident': biased({ aggression: 1.15, bluff: 1, tightness: 0.95 }),
  'cfr-cautious': biased({ aggression: 0.9, bluff: 0.9, tightness: 1.2 }),
  'cfr-talk-obvious': talking(0),
  'cfr-talk-subtle': talking(0.5),
  'cfr-talk-hidden': talking(0.9),
  reader,
  'tilt-exploiter': tiltExploiter,
  'always-call': alwaysCall,
  'always-raise': alwaysRaise,
  'min-bettor': minBettor,
  random,
};

export type BotName = keyof typeof BOTS;

const NEUTRAL: BotBias = { aggression: 1, bluff: 1, tightness: 1, sizing: 1, stickiness: 1 };
const BIAS_MARK = '@';

function cfrFile(name: string): string | null {
  return name.startsWith(CFR_FILE) && name.length > CFR_FILE.length
    ? name.slice(CFR_FILE.length)
    : null;
}

function splitBias(name: string): { base: string; axes: string | null } {
  const at = name.lastIndexOf(BIAS_MARK);
  return at < 0
    ? { base: name, axes: null }
    : { base: name.slice(0, at), axes: name.slice(at + 1) };
}

function parseAxes(axes: string): BotBias | null {
  const bias: BotBias = { ...NEUTRAL };
  for (const part of axes.split(',')) {
    const [key, raw] = part.split('=');
    const value = Number(raw);
    if (key === undefined || !Object.hasOwn(NEUTRAL, key) || !(value > 0)) return null;
    bias[key as keyof BotBias] = value;
  }
  return bias;
}

const isCfr = (base: string): boolean => base === SHIPPED || cfrFile(base) !== null;

export function biasOfName(name: string): BotBias | null {
  const { base, axes } = splitBias(name);
  return axes === null || !isCfr(base) ? null : parseAxes(axes);
}

export function isBotName(name: string): boolean {
  const { base, axes } = splitBias(name);
  if (axes !== null) return biasOfName(name) !== null;
  return Object.hasOwn(BOTS, base) || cfrFile(base) !== null;
}

export function botFactory(name: string): BotFactory {
  const { base } = splitBias(name);
  const bias = biasOfName(name);
  if (bias !== null) return cfrBot(base, bias);
  if (cfrFile(name) !== null) return cfrBot(name);
  if (!Object.hasOwn(BOTS, name)) {
    throw new Error(`unknown bot "${name}", choose from: ${Object.keys(BOTS).join(', ')}`);
  }
  return BOTS[name as BotName];
}

function baseLabel(name: string): string {
  const file = cfrFile(name);
  if (file === null) return name;
  const base = basename(file)
    .replace(/\.gz$/, '')
    .replace(/\.mlcs$/, '');
  return `cfr-${base}`;
}

export function botLabel(name: string): string {
  const { base, axes } = splitBias(name);
  if (axes === null) return baseLabel(name);
  const suffix = axes
    .split(',')
    .map((part) => part.replace('=', ''))
    .join('-');
  return `${baseLabel(base)}-${suffix}`;
}

function strategyUrl(name: string): URL | null {
  if (name === SHIPPED) return SHIPPED_STRATEGIES[SHIPPED].url;
  const file = cfrFile(name);
  return file === null ? null : pathToFileURL(resolve(file));
}

export async function prepareBots(names: readonly string[]): Promise<void> {
  for (const name of names.map((n) => splitBias(n).base)) {
    const key = cfrFile(name) === null && name.startsWith(SHIPPED) ? SHIPPED : name;
    const url = strategyUrl(key);
    if (url !== null && !cfrModels.has(key)) cfrModels.set(key, await loadCfrModel(url, read));
  }
}
