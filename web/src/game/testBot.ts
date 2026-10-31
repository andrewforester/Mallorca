import type { Action, LegalActions } from '../engine/index.ts';
import { checkOrCall } from '../engine/index.ts';
import type { BotClient } from './botClient.ts';

export interface ScriptedBot extends BotClient {
  decideCalls: number;
}

export function scriptedBot(pick: (legal: LegalActions) => Action): ScriptedBot {
  const bot: ScriptedBot = {
    decideCalls: 0,
    observe: () => undefined,
    reset: () => undefined,
    decide: (legal) => {
      bot.decideCalls += 1;
      return Promise.resolve({
        action: pick(legal),
        solverChoice: 'passive',
        evByAction: { fold: 0, passive: 0, aggressive: 0 },
      });
    },
  };
  return bot;
}

export function callingBot(): ScriptedBot {
  return scriptedBot(checkOrCall);
}

export function shovingBot(): ScriptedBot {
  return scriptedBot((legal) =>
    legal.raise ? { kind: 'raise', to: legal.raise.max } : { kind: 'call' },
  );
}
