import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/cards/index.ts';
import type { EngineEvent, SeatIndex } from '../../src/engine/index.ts';
import { BOTS } from './bots.ts';
import type { BotName } from './bots.ts';
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
    const bot = BOTS['min-bettor'](mulberry32(1));
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
});
