import { fullDeck, mulberry32, shuffle } from '../../src/cards/index.ts';
import type { Action, EngineEvent, LegalActions, SeatIndex, Step } from '../../src/engine/index.ts';
import { CASH, createTable, playToEnd, rulesOf, startHandWith } from '../../src/engine/index.ts';
import { toObservations } from '../../src/brains/index.ts';
import type { ArenaBot } from './arenaBot.ts';
import type { BotFactory } from './bots.ts';

const SEATS = createTable(['seat0', 'seat1'], CASH).seats;
const STACK = SEATS[0].stack;

function playHand(
  factories: [BotFactory, BotFactory],
  seed: number,
  index: number,
  k: number,
): { events: EngineEvent[]; stacks: [number, number] } {
  const deckRng = mulberry32((Math.imul(seed, 0x9e3779b1) + index) >>> 0);
  const deck = shuffle(fullDeck(), deckRng);
  const bots = factories.map((make, seat) =>
    make(mulberry32((seed ^ (index * 4 + k * 2 + seat)) >>> 0)),
  ) as [ArenaBot, ArenaBot];
  const events: EngineEvent[] = [];
  const feed = (step: Step) => {
    events.push(...step.events);
    for (const seat of [0, 1] as const) {
      for (const o of toObservations(step.events, seat)) bots[seat].observe(o);
    }
  };
  const handNumber = index * 2 + k + 1;
  const start = startHandWith(
    SEATS,
    { button: 0, blinds: rulesOf(CASH).blinds(handNumber), handNumber },
    deck,
  );
  const act = (seat: SeatIndex, legal: LegalActions): Action => {
    const actor = bots[seat];
    const action = actor.decide(legal);
    if (action.kind === 'raise' && actor.spoke) {
      bots[seat === 0 ? 1 : 0].heard?.(actor.spoke());
    }
    return action;
  };
  const end = playToEnd(start, act, feed);
  for (const bot of bots) bot.dispose?.();
  return { events, stacks: [end.seats[0].stack, end.seats[1].stack] };
}

export function playPair(
  a: BotFactory,
  b: BotFactory,
  seed: number,
  index: number,
): { net: number; hands: EngineEvent[][] } {
  const first = playHand([a, b], seed, index, 0);
  const second = playHand([b, a], seed, index, 1);
  return {
    net: first.stacks[0] - STACK + (second.stacks[1] - STACK),
    hands: [first.events, second.events],
  };
}
