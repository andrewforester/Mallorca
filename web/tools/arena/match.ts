import { fullDeck, mulberry32, shuffle } from '../../src/cards/index.ts';
import type { Action, EngineEvent, LegalActions, SeatIndex, Step } from '../../src/engine/index.ts';
import { CASH, createTable, playToEnd, rulesOf, startHandWith } from '../../src/engine/index.ts';
import { toObservations } from '../../src/brains/index.ts';
import type { ArenaBot } from './arenaBot.ts';
import type { BotFactory } from './bots.ts';

const SEATS = createTable(['seat0', 'seat1'], CASH).seats;
const STACK = SEATS[0].stack;

interface Deal {
  seed: number;
  deck: number;
  side: number;
  button: SeatIndex;
}

function playHand(bots: [ArenaBot, ArenaBot], deal: Deal): EngineEvent[] {
  const deckRng = mulberry32((Math.imul(deal.seed, 0x9e3779b1) + deal.deck) >>> 0);
  const deck = shuffle(fullDeck(), deckRng);
  const events: EngineEvent[] = [];
  const feed = (step: Step) => {
    events.push(...step.events);
    for (const seat of [0, 1] as const) {
      for (const o of toObservations(step.events, seat)) bots[seat].observe(o);
      bots[seat].events?.(step.events);
    }
  };
  const handNumber = deal.deck * 2 + deal.side + 1;
  const start = startHandWith(
    SEATS,
    { button: deal.button, blinds: rulesOf(CASH).blinds(handNumber), handNumber },
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
  playToEnd(start, act, feed);
  return events;
}

const finalStacks = (events: EngineEvent[]): [number, number] => {
  const ended = events.find((e) => e.type === 'handEnded');
  if (ended?.type !== 'handEnded') throw new Error('a hand ended without handEnded');
  return ended.stacks;
};

function playSession(
  factories: [BotFactory, BotFactory],
  seed: number,
  index: number,
  side: number,
  length: number,
): EngineEvent[][] {
  const bots = factories.map((make, seat) =>
    make(mulberry32((seed ^ (index * 4 + side * 2 + seat)) >>> 0), seat as SeatIndex),
  ) as [ArenaBot, ArenaBot];
  const hands: EngineEvent[][] = [];
  for (let j = 0; j < length; j++) {
    const deck = index * length + j;
    hands.push(playHand(bots, { seed, deck, side, button: (j % 2) as SeatIndex }));
  }
  for (const bot of bots) bot.dispose?.();
  return hands;
}

export function playPair(
  a: BotFactory,
  b: BotFactory,
  seed: number,
  index: number,
  session = 1,
): { net: number; hands: EngineEvent[][] } {
  const first = playSession([a, b], seed, index, 0, session);
  const second = playSession([b, a], seed, index, 1, session);
  const net =
    first.reduce((sum, h) => sum + finalStacks(h)[0] - STACK, 0) +
    second.reduce((sum, h) => sum + finalStacks(h)[1] - STACK, 0);
  return { net, hands: [...first, ...second] };
}
