import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Action, LegalActions } from '../../src/engine/index.ts';
import type { BotStyle } from '../../src/brains/index.ts';
import { createMathBrain, randomVillainModel } from '../../src/brains/index.ts';
import type { Rng } from '../../src/cards/index.ts';
import type { CfrModel, ShippedStrategyKey } from '../../src/cfr/index.ts';
import { SHIPPED_STRATEGIES, createCfrBrain, loadCfrModel } from '../../src/cfr/index.ts';
import { strengthOf } from '../../src/talk/index.ts';
import type { Level } from '../../src/talk/index.ts';
import type { ArenaBot } from './arenaBot.ts';
import { createExploiter } from './exploiter.ts';
import { createReader } from './reader.ts';
import { createTalkingBot } from './talking.ts';

export type { ArenaBot } from './arenaBot.ts';

export type BotFactory = (rng: Rng) => ArenaBot;

function passive(legal: LegalActions): Action {
  return legal.check ? { kind: 'check' } : { kind: 'call' };
}

const math: BotFactory = () => {
  const brain = createMathBrain({ villainModel: randomVillainModel });
  return {
    observe: (o) => brain.observe(o),
    decide: (legal) => brain.decide(legal).action,
  };
};

const alwaysCall: BotFactory = () => ({
  observe: () => undefined,
  decide: passive,
});

const alwaysRaise: BotFactory = () => ({
  observe: () => undefined,
  decide: (legal) => (legal.raise ? { kind: 'raise', to: legal.raise.min } : passive(legal)),
});

const minBettor: BotFactory = () => ({
  observe: () => undefined,
  decide: (legal) =>
    legal.call === null && legal.raise ? { kind: 'raise', to: legal.raise.min } : passive(legal),
});

const random: BotFactory = (rng) => ({
  observe: () => undefined,
  decide: (legal) => {
    const options: Action[] = [];
    if (legal.fold) options.push({ kind: 'fold' });
    if (legal.check) options.push({ kind: 'check' });
    if (legal.call !== null) options.push({ kind: 'call' });
    if (legal.raise) options.push({ kind: 'raise', to: legal.raise.min });
    return options[Math.floor(rng.next() * options.length)] ?? passive(legal);
  },
});

const CFR_FILE = 'cfr:';
const SHIPPED: ShippedStrategyKey = 'cfr';
const cfrModels = new Map<string, CfrModel>();
const read = (url: URL) => readFile(url);

function cfrBot(key: string, style?: BotStyle): BotFactory {
  return (rng) => {
    const model = cfrModels.get(key);
    if (model === undefined) {
      throw new Error('The cfr bot needs prepareBots before it plays');
    }
    const brain = createCfrBrain(model, rng);
    if (style) brain.setStyle?.(style);
    return {
      observe: (o) => brain.observe(o),
      decide: (legal) => brain.decide(legal).action,
      dispose: () => brain.dispose(),
    };
  };
}

const cfr = cfrBot(SHIPPED);

const styled = (style: BotStyle): BotFactory => cfrBot(SHIPPED, style);

const talking =
  (level: Level): BotFactory =>
  (rng) =>
    createTalkingBot(cfr(rng), level, rng);

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
  'cfr-tilted': styled({ aggression: 1.6, bluff: 1.8, tightness: 0.85 }),
  'cfr-confident': styled({ aggression: 1.15, bluff: 1, tightness: 0.95 }),
  'cfr-cautious': styled({ aggression: 0.9, bluff: 0.9, tightness: 1.2 }),
  'cfr-talk-obvious': talking('obvious'),
  'cfr-talk-subtle': talking('subtle'),
  'cfr-talk-hidden': talking('hidden'),
  reader,
  'tilt-exploiter': tiltExploiter,
  'always-call': alwaysCall,
  'always-raise': alwaysRaise,
  'min-bettor': minBettor,
  random,
};

export type BotName = keyof typeof BOTS;

function cfrFile(name: string): string | null {
  return name.startsWith(CFR_FILE) && name.length > CFR_FILE.length
    ? name.slice(CFR_FILE.length)
    : null;
}

export function isBotName(name: string): boolean {
  return Object.hasOwn(BOTS, name) || cfrFile(name) !== null;
}

export function botFactory(name: string): BotFactory {
  if (cfrFile(name) !== null) return cfrBot(name);
  if (!Object.hasOwn(BOTS, name)) {
    throw new Error(`unknown bot "${name}", choose from: ${Object.keys(BOTS).join(', ')}`);
  }
  return BOTS[name as BotName];
}

export function botLabel(name: string): string {
  const file = cfrFile(name);
  if (file === null) return name;
  const base = basename(file)
    .replace(/\.gz$/, '')
    .replace(/\.mlcs$/, '');
  return `cfr-${base}`;
}

function strategyUrl(name: string): URL | null {
  if (name === SHIPPED) return SHIPPED_STRATEGIES[SHIPPED].url;
  const file = cfrFile(name);
  return file === null ? null : pathToFileURL(resolve(file));
}

export async function prepareBots(names: readonly string[]): Promise<void> {
  for (const name of names) {
    const key = cfrFile(name) === null && name.startsWith(SHIPPED) ? SHIPPED : name;
    const url = strategyUrl(key);
    if (url !== null && !cfrModels.has(key)) cfrModels.set(key, await loadCfrModel(url, read));
  }
}
