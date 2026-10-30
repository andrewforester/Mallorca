import type { Action, LegalActions } from '../../src/engine/index.ts';
import type { Observation } from '../../src/brains/index.ts';
import { createMathBrain, randomVillainModel } from '../../src/brains/index.ts';
import type { Rng } from '../../src/cards/index.ts';
import type { CfrModel } from '../../src/cfr/index.ts';
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

let cfrModel: CfrModel | null = null;

const cfr: BotFactory = (rng) => {
  if (cfrModel === null) {
    throw new Error('The cfr bot needs prepareBots before it plays');
  }
  const brain = createCfrBrain(cfrModel, rng);
  return {
    observe: (o) => brain.observe(o),
    decide: (legal) => brain.decide(legal).action,
    dispose: () => brain.dispose(),
  };
};

export const BOTS: Record<
  'math' | 'cfr' | 'always-call' | 'always-raise' | 'min-bettor' | 'random',
  BotFactory
> = {
  math,
  cfr,
  'always-call': alwaysCall,
  'always-raise': alwaysRaise,
  'min-bettor': minBettor,
  random,
};

export type BotName = keyof typeof BOTS;

export async function prepareBots(names: readonly string[]): Promise<void> {
  if (names.includes('cfr') && cfrModel === null) {
    cfrModel = await loadCfrModel();
  }
}
