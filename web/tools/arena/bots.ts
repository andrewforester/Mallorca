import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Action, LegalActions } from '../../src/engine/index.ts';
import { checkOrCall } from '../../src/engine/index.ts';
import type { Brain, Observation } from '../../src/brains/index.ts';
import { createMathBrain } from '../../src/brains/index.ts';
import type { Rng } from '../../src/cards/index.ts';
import type { CfrModel, ShippedStrategyKey } from '../../src/cfr/index.ts';
import { SHIPPED_STRATEGIES, createCfrBrain, loadCfrModel } from '../../src/cfr/index.ts';

export interface ArenaBot {
  observe(o: Observation): void;
  decide(legal: LegalActions): Action;
  dispose?(): void;
}

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

function cfrBot(key: string): BotFactory {
  return (rng) => {
    const model = cfrModels.get(key);
    if (model === undefined) {
      throw new Error('The cfr bot needs prepareBots before it plays');
    }
    return fromBrain(createCfrBrain(model, rng));
  };
}

export const BOTS: Record<
  'math' | 'cfr' | 'always-call' | 'always-raise' | 'min-bettor' | 'random',
  BotFactory
> = {
  math,
  cfr: cfrBot(SHIPPED),
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
    const url = strategyUrl(name);
    if (url !== null && !cfrModels.has(name)) cfrModels.set(name, await loadCfrModel(url, read));
  }
}
