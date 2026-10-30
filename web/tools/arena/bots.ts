import type { Action, LegalActions } from '../../src/engine/index.ts';
import type { BotStyle } from '../../src/brains/index.ts';
import { createMathBrain, randomVillainModel } from '../../src/brains/index.ts';
import type { Rng } from '../../src/cards/index.ts';
import type { CfrModel } from '../../src/cfr/index.ts';
import { createCfrBrain } from '../../src/cfr/index.ts';
import type { Level } from '../../src/talk/index.ts';
import type { ArenaBot } from './arenaBot.ts';
import { loadCfrModel } from './cfrModel.ts';
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

let cfrModel: CfrModel | null = null;

function createCfrBot(rng: Rng, style?: BotStyle): ArenaBot {
  if (cfrModel === null) {
    throw new Error('The cfr bot needs prepareBots before it plays');
  }
  const brain = createCfrBrain(cfrModel, rng);
  if (style) brain.setStyle?.(style);
  return {
    observe: (o) => brain.observe(o),
    decide: (legal) => brain.decide(legal).action,
    dispose: () => brain.dispose(),
  };
}

const cfr: BotFactory = (rng) => createCfrBot(rng);

const styled =
  (style: BotStyle): BotFactory =>
  (rng) =>
    createCfrBot(rng, style);

const talking =
  (level: Level): BotFactory =>
  (rng) =>
    createTalkingBot(createCfrBot(rng), level, rng);

const reader: BotFactory = (rng) => createReader(math(rng));

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
  | 'always-call'
  | 'always-raise'
  | 'min-bettor'
  | 'random',
  BotFactory
> = {
  math,
  cfr,
  'cfr-tilted': styled({ aggression: 1.25, bluff: 1.3, tightness: 0.85 }),
  'cfr-confident': styled({ aggression: 1.15, bluff: 1, tightness: 0.95 }),
  'cfr-cautious': styled({ aggression: 0.9, bluff: 0.9, tightness: 1.2 }),
  'cfr-talk-obvious': talking('obvious'),
  'cfr-talk-subtle': talking('subtle'),
  'cfr-talk-hidden': talking('hidden'),
  reader,
  'always-call': alwaysCall,
  'always-raise': alwaysRaise,
  'min-bettor': minBettor,
  random,
};

export type BotName = keyof typeof BOTS;

export async function prepareBots(names: readonly string[]): Promise<void> {
  if (names.some((name) => name.startsWith('cfr')) && cfrModel === null) {
    cfrModel = await loadCfrModel();
  }
}
