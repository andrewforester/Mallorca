import type { ArenaBot } from './arenaBot.ts';

const POT_SHARE = 0.5;

export function createReader(inner: ArenaBot): ArenaBot {
  let pot = 0;
  let heard: boolean | null = null;
  return {
    observe(o) {
      if (o.type === 'handStarted') {
        pot = o.smallBlind + o.bigBlind;
      } else if (o.type === 'acted') {
        pot += o.amount;
      }
      inner.observe(o);
    },
    decide(legal) {
      const action = inner.decide(legal);
      const signal = heard;
      heard = null;
      if (signal === null || legal.call === null) {
        return action;
      }
      if (action.kind === 'fold' && signal && legal.call <= pot * POT_SHARE) {
        return { kind: 'call' };
      }
      if (action.kind === 'call' && !signal && legal.fold) {
        return { kind: 'fold' };
      }
      return action;
    },
    heard(spoke) {
      heard = spoke;
    },
    dispose: () => inner.dispose?.(),
  };
}
