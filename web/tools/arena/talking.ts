import type { Card, Rng } from '../../src/cards/index.ts';
import { BASE_HABITS, habitsAt } from '../../src/conversation/index.ts';
import { strengthOf } from '../../src/persona/index.ts';
import type { Level } from '../../src/conversation/index.ts';
import type { ArenaBot } from './arenaBot.ts';

export function createTalkingBot(inner: ArenaBot, level: Level, rng: Rng): ArenaBot {
  const habits = habitsAt(BASE_HABITS, level);
  let hole: [Card, Card] | null = null;
  let board: Card[] = [];
  let spoke = false;
  return {
    observe(o) {
      if (o.type === 'handStarted') {
        hole = null;
        board = [];
      } else if (o.type === 'holeCards') {
        hole = o.cards;
      } else if (o.type === 'street') {
        board = o.board;
      }
      inner.observe(o);
    },
    decide(legal) {
      const action = inner.decide(legal);
      spoke = false;
      if (action.kind === 'raise' && hole !== null) {
        const chance = habits.herBet[strengthOf(hole, board, rng)].speak;
        spoke = rng.next() < chance;
      }
      return action;
    },
    spoke: () => spoke,
    dispose: () => inner.dispose?.(),
  };
}
