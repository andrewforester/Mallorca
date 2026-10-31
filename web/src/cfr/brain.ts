import type { Rng } from '../cards/index.ts';
import type { BotStyle, Brain, Decision, Observation } from '../brains/index.ts';
import type { Action, LegalActions } from '../engine/index.ts';
import type { CfrModel } from './model.ts';

const UNKNOWN_EV = {
  fold: Number.NaN,
  passive: Number.NaN,
  aggressive: Number.NaN,
};

function choiceOf(action: Action): Decision['solverChoice'] {
  switch (action.kind) {
    case 'fold':
      return 'fold';
    case 'raise':
      return 'aggressive';
    default:
      return 'passive';
  }
}

export function createCfrBrain(model: CfrModel, rng: Rng): Required<Brain> {
  const bot = model.newBot();
  return {
    observe(o: Observation) {
      switch (o.type) {
        case 'handStarted':
          bot.handStarted(o);
          break;
        case 'holeCards':
          bot.holeCards(o.cards);
          break;
        case 'acted':
          bot.acted(o.who === 'hero', o.action, rng.next());
          break;
        case 'street':
          bot.street(o.board);
          break;
      }
    },
    decide(legal: LegalActions): Decision {
      const action = bot.decide(legal, rng.next());
      return { action, solverChoice: choiceOf(action), evByAction: { ...UNKNOWN_EV } };
    },
    setStyle(style: BotStyle) {
      bot.setStyle(style);
    },
    dispose() {
      bot.free();
    },
  };
}
