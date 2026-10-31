import { describe, expect, it } from 'vitest';
import { mulberry32, parseCards } from '../../src/cards/index.ts';
import type { Action } from '../../src/engine/index.ts';
import type { ArenaBot } from './arenaBot.ts';
import { createTalkingBot } from './talking.ts';

const raiseLegal = { fold: false, check: true, call: null, raise: { min: 20, max: 2000 } };

function inner(action: Action): ArenaBot {
  return { observe: () => undefined, decide: () => action };
}

function speaks(
  hole: string,
  action: Action,
  level: 'obvious' | 'subtle' | 'hidden',
  spots: number,
) {
  const [a, b] = parseCards(hole);
  let count = 0;
  for (let seed = 0; seed < spots; seed++) {
    const bot = createTalkingBot(inner(action), level, mulberry32(seed + 1));
    bot.observe({ type: 'holeCards', cards: [a!, b!] });
    bot.decide(raiseLegal);
    if (bot.spoke?.()) count++;
  }
  return count / spots;
}

describe('the talking bot', () => {
  it('speaks more after a weak-hand bet than after a strong one on obvious', () => {
    const raise: Action = { kind: 'raise', to: 60 };
    const weak = speaks('7c 2d', raise, 'obvious', 2000);
    const strong = speaks('As Ah', raise, 'obvious', 2000);
    expect(weak).toBeGreaterThan(strong + 0.2);
  }, 60_000);

  it('never speaks without a raise', () => {
    expect(speaks('7c 2d', { kind: 'check' }, 'obvious', 200)).toBe(0);
  });

  it('does not speak before it has decided', () => {
    const bot = createTalkingBot(inner({ kind: 'check' }), 'obvious', mulberry32(1));
    expect(bot.spoke?.()).toBe(false);
  });

  it('passes the action through unchanged and forwards observations and dispose', () => {
    const seen: string[] = [];
    const wrapped: ArenaBot = {
      observe: (o) => seen.push(o.type),
      decide: () => ({ kind: 'call' }),
      dispose: () => seen.push('dispose'),
    };
    const bot = createTalkingBot(wrapped, 'hidden', mulberry32(1));
    bot.observe({ type: 'holeCards', cards: parseCards('Ks Qs') as [never, never] });
    expect(bot.decide(raiseLegal)).toEqual({ kind: 'call' });
    bot.dispose?.();
    expect(seen).toEqual(['holeCards', 'dispose']);
  });

  it('uses the board of the current street to class its hand', () => {
    const [a, b] = parseCards('Ks Kd');
    const bot = createTalkingBot(inner({ kind: 'raise', to: 60 }), 'obvious', mulberry32(3));
    bot.observe({ type: 'holeCards', cards: [a!, b!] });
    bot.observe({ type: 'street', street: 'flop', board: parseCards('Kh 7c 2d') });
    expect(() => bot.decide(raiseLegal)).not.toThrow();
  });
});
