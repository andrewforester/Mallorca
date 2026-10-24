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

let cfrModel: CfrModel | null = null;

export const ARENA_SOLVER: SolverOptions = { turn: 100, river: 200 };

function cfrFactory(options?: BotOptions): BotFactory {
  return (rng) => {
    if (cfrModel === null) {
      throw new Error('The cfr bot needs prepareBots before it plays');
    }
    const brain = createCfrBrain(cfrModel, rng, options);
    return {
      observe: (o) => brain.observe(o),
      decide: (legal) => brain.decide(legal).action,
      dispose: () => brain.dispose(),
    };
  };
}

const cfr = cfrFactory();
const cfrSolve = cfrFactory({ solver: ARENA_SOLVER });

export const BOTS: Record<
  'math' | 'cfr' | 'cfr-solve' | 'always-call' | 'always-raise' | 'random',
  BotFactory
> = {
  math,
  cfr,
  'cfr-solve': cfrSolve,
  'always-call': alwaysCall,
  'always-raise': alwaysRaise,
  random,
};

export type BotName = keyof typeof BOTS;

export async function prepareBots(names: readonly string[]): Promise<void> {
  if ((names.includes('cfr') || names.includes('cfr-solve')) && cfrModel === null) {
    cfrModel = await loadCfrModel();
  }
}
