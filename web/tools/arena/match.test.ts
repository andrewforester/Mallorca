import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/cards/index.ts';
import { CASH, createTable, rulesOf } from '../../src/engine/index.ts';
import type { EngineEvent, SeatIndex } from '../../src/engine/index.ts';
import { BOTS } from './bots.ts';
import type { BotFactory, BotName } from './bots.ts';
import type { ArenaBot } from './arenaBot.ts';
import { playPair } from './match.ts';

const hole = (hand: EngineEvent[], seat: SeatIndex) =>
  hand.find((e) => e.type === 'holeCards' && e.seat === seat);

describe('playPair', () => {
  it('the math bot against itself nets exactly zero per pair', () => {
    for (let i = 0; i < 10; i++) {
      expect(playPair(BOTS.math, BOTS.math, 1, i).net).toBe(0);
    }
  }, 120_000);

  it('the min-bettor bets the minimum into no bet and calls a bet', () => {
    const bot = BOTS['min-bettor'](mulberry32(1), 0);
    const raise = { min: 20, max: 400 };
    expect(bot.decide({ fold: false, check: true, call: null, raise })).toEqual({
      kind: 'raise',
      to: 20,
    });
    expect(bot.decide({ fold: false, check: true, call: null, raise: null })).toEqual({
      kind: 'check',
    });
    expect(bot.decide({ fold: true, check: false, call: 30, raise })).toEqual({ kind: 'call' });
  });

  it('a pair is the same deck with the seats swapped', () => {
    const { hands } = playPair(BOTS['always-call'], BOTS['always-raise'], 5, 3);
    const first = hole(hands[0]!, 0);
    expect(first).toBeDefined();
    expect(first).toEqual(hole(hands[1]!, 0));
  });

  it('is deterministic for a seed and index', () => {
    expect(playPair(BOTS.random, BOTS.math, 9, 2)).toEqual(playPair(BOTS.random, BOTS.math, 9, 2));
  });

  it('chips are conserved in every hand', () => {
    const { hands } = playPair(BOTS['always-raise'], BOTS.random, 4, 1);
    expect(hands).toHaveLength(2);
    for (const hand of hands) {
      const ended = hand.find((e) => e.type === 'handEnded');
      expect(ended?.type === 'handEnded' ? ended.stacks[0] + ended.stacks[1] : null).toBe(4000);
    }
  });

  it('net is the first bot gain over both hands, recomputed from the events', () => {
    const finalStacks = (hand: EngineEvent[]) => {
      const ended = hand.find((e) => e.type === 'handEnded');
      if (ended?.type !== 'handEnded') throw new Error('no handEnded');
      return ended.stacks;
    };
    const cases: [BotName, BotName, number, number, number][] = [
      ['random', 'always-raise', 1, 0, -80],
      ['random', 'always-raise', 1, 1, -160],
      ['random', 'always-call', 7, 5, -70],
      ['always-raise', 'always-call', 1, 0, 0],
    ];
    for (const [a, b, seed, index, expected] of cases) {
      const { net, hands } = playPair(BOTS[a], BOTS[b], seed, index);
      const recomputed = finalStacks(hands[0]!)[0] - 2000 + (finalStacks(hands[1]!)[1] - 2000);
      expect(net).toBe(recomputed);
      expect(net).toBe(expected);
    }
  });

  it('passes what a bot said to the other once per raise', () => {
    const log: string[] = [];
    let raises = 0;
    const talker: ArenaBot = {
      observe: () => undefined,
      decide: (legal) => {
        if (legal.raise) {
          raises++;
          return { kind: 'raise', to: legal.raise.min };
        }
        return { kind: 'call' };
      },
      spoke: () => true,
    };
    const listener: ArenaBot = {
      observe: () => undefined,
      decide: (legal) => (legal.check ? { kind: 'check' } : { kind: 'call' }),
      heard: (spoke) => log.push(String(spoke)),
    };
    playPair(
      () => talker,
      () => listener,
      1,
      0,
    );
    expect(raises).toBeGreaterThan(0);
    expect(log).toEqual(Array<string>(raises).fill('true'));
  });

  it('does not call heard when the actor has no spoke', () => {
    let heard = 0;
    const raiser: ArenaBot = {
      observe: () => undefined,
      decide: (legal) => (legal.raise ? { kind: 'raise', to: legal.raise.min } : { kind: 'call' }),
    };
    const listener: ArenaBot = {
      observe: () => undefined,
      decide: (legal) => (legal.check ? { kind: 'check' } : { kind: 'call' }),
      heard: () => heard++,
    };
    playPair(
      () => raiser,
      () => listener,
      1,
      0,
    );
    expect(heard).toBe(0);
  });

  it('plays both hands at the cash stakes', () => {
    const { hands } = playPair(BOTS['always-call'], BOTS['always-raise'], 5, 3);
    const { small, big } = rulesOf(CASH).blinds(1);
    const stack = createTable(['A', 'B'], CASH).seats[0].stack;
    for (const hand of hands) {
      expect(hand[0]).toMatchObject({
        type: 'handStarted',
        smallBlind: small,
        bigBlind: big,
        stacks: [stack, stack],
      });
    }
  });

  const started = (hand: EngineEvent[]) => {
    const e = hand[0];
    if (e?.type !== 'handStarted') throw new Error('no handStarted');
    return e;
  };

  it('a session makes each bot once per side and plays its hands in a row', () => {
    const made: string[] = [];
    const counting =
      (name: string): BotFactory =>
      (rng, seat) => {
        made.push(`${name}${seat}`);
        return BOTS['always-call'](rng, seat);
      };
    const { hands } = playPair(counting('a'), counting('b'), 2, 1, 3);
    expect(hands).toHaveLength(6);
    expect(made).toEqual(['a0', 'b1', 'b0', 'a1']);
  });

  it('a mirrored session plays the same decks with the seats swapped', () => {
    const { hands } = playPair(BOTS['always-call'], BOTS['always-raise'], 5, 2, 3);
    for (let j = 0; j < 3; j++) {
      expect(hole(hands[j]!, 0)).toBeDefined();
      expect(hole(hands[3 + j]!, 0)).toEqual(hole(hands[j]!, 0));
      expect(hole(hands[3 + j]!, 1)).toEqual(hole(hands[j]!, 1));
    }
    expect(hole(hands[0]!, 0)).not.toEqual(hole(hands[1]!, 0));
  });

  it('a session moves the button every hand and numbers hands by deck and side', () => {
    const { hands } = playPair(BOTS['always-call'], BOTS['always-call'], 5, 2, 3);
    expect(hands.map((h) => started(h).button)).toEqual([0, 1, 0, 0, 1, 0]);
    expect(hands.map((h) => started(h).handNumber)).toEqual([13, 15, 17, 14, 16, 18]);
  });

  it('a session nets bot A over all its hands', () => {
    const { net, hands } = playPair(BOTS.random, BOTS['always-raise'], 3, 0, 4);
    const end = (hand: EngineEvent[]) => {
      const e = hand.find((x) => x.type === 'handEnded');
      if (e?.type !== 'handEnded') throw new Error('no handEnded');
      return e.stacks;
    };
    const recomputed = hands.reduce((sum, h, i) => sum + end(h)[i < 4 ? 0 : 1] - 2000, 0);
    expect(net).toBe(recomputed);
  });

  it('passes every step of the engine to a bot that listens', () => {
    const seen: EngineEvent[] = [];
    const listener: BotFactory = (rng, seat) => ({
      ...BOTS['always-call'](rng, seat),
      events: (events) => seen.push(...events),
    });
    const { hands } = playPair(listener, BOTS['always-raise'], 1, 0, 2);
    expect(seen).toEqual([...hands[0]!, ...hands[1]!, ...hands[2]!, ...hands[3]!]);
  });
});
