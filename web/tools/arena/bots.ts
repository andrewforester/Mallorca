import { basename } from 'node:path';
import type { Action, LegalActions } from '../../src/engine/index.ts';
import type { Observation } from '../../src/brains/index.ts';
import { createMathBrain, randomVillainModel } from '../../src/brains/index.ts';
import type { Rng } from '../../src/cards/index.ts';
import type { BotOptions, CfrModel, SolverOptions } from '../../src/cfr/index.ts';
import { createCfrBrain } from '../../src/cfr/index.ts';
import { loadCfrModel } from './cfrModel.ts';

export interface ArenaBot {
  observe(o: Observation): void;
  decide(legal: LegalActions): Action;
  dispose?(): void;
}

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
const CFR_SOLVE_FILE = 'cfr-solve:';
const SHIPPED = 'cfr';
const cfrModels = new Map<string, CfrModel>();

export const ARENA_SOLVER: SolverOptions = { turn: 50, river: 200 };

function cfrBot(key: string, options?: BotOptions): BotFactory {
  return (rng) => {
    const model = cfrModels.get(key);
    if (model === undefined) {
      throw new Error('The cfr bot needs prepareBots before it plays');
    }
    const brain = createCfrBrain(model, rng, options);
    return {
      observe: (o) => brain.observe(o),
      decide: (legal) => brain.decide(legal).action,
      dispose: () => brain.dispose(),
    };
  };
}

export const BOTS: Record<
  'math' | 'cfr' | 'cfr-solve' | 'always-call' | 'always-raise' | 'min-bettor' | 'random',
  BotFactory
> = {
  math,
  cfr: cfrBot(SHIPPED),
  'cfr-solve': cfrBot(SHIPPED, { solver: ARENA_SOLVER }),
  'always-call': alwaysCall,
  'always-raise': alwaysRaise,
  'min-bettor': minBettor,
  random,
};

export type BotName = keyof typeof BOTS;

interface CfrFile {
  path: string;
  solve: boolean;
}

function cfrFile(name: string): CfrFile | null {
  for (const [prefix, solve] of [
    [CFR_FILE, false],
    [CFR_SOLVE_FILE, true],
  ] as const) {
    if (name.startsWith(prefix) && name.length > prefix.length) {
      return { path: name.slice(prefix.length), solve };
    }
  }
  return null;
}

function modelKey(name: string): string | null {
  if (name === 'cfr' || name === 'cfr-solve') return SHIPPED;
  return cfrFile(name)?.path ?? null;
}

export function isBotName(name: string): boolean {
  return Object.hasOwn(BOTS, name) || cfrFile(name) !== null;
}

export function botFactory(name: string): BotFactory {
  const file = cfrFile(name);
  if (file !== null) return cfrBot(file.path, file.solve ? { solver: ARENA_SOLVER } : undefined);
  if (!Object.hasOwn(BOTS, name)) {
    throw new Error(`unknown bot "${name}", choose from: ${Object.keys(BOTS).join(', ')}`);
  }
  return BOTS[name as BotName];
}

export function botLabel(name: string): string {
  const file = cfrFile(name);
  if (file === null) return name;
  const base = basename(file.path)
    .replace(/\.gz$/, '')
    .replace(/\.mlcs$/, '');
  return `${file.solve ? 'cfr-solve' : 'cfr'}-${base}`;
}

export async function prepareBots(names: readonly string[]): Promise<void> {
  for (const name of names) {
    const key = modelKey(name);
    if (key === null || cfrModels.has(key)) continue;
    cfrModels.set(key, await (key === SHIPPED ? loadCfrModel() : loadCfrModel(key)));
  }
}
