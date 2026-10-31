import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '../engine/index.ts';
import { potCollected, resultOf } from './session.ts';

function showdown(ranks: [number, number]): EngineEvent {
  return {
    type: 'showdown',
    hands: [
      { cards: [0, 1], rank: ranks[0], category: 'pair' },
      { cards: [2, 3], rank: ranks[1], category: 'flush' },
    ],
    pot: 4000,
  };
}

describe('resultOf', () => {
  it('names the short stack as the winner when it wins and the big stack gets a refund', () => {
    const events: EngineEvent[] = [
      showdown([100, 5000]),
      { type: 'potAwarded', seat: 0, amount: 3000 },
      { type: 'potAwarded', seat: 1, amount: 1000 },
    ];
    expect(resultOf(events)).toEqual({ winner: 1, category: 'flush', showdown: true });
  });

  it('names the big stack as the winner when the short stack loses', () => {
    const events: EngineEvent[] = [
      showdown([5000, 100]),
      { type: 'potAwarded', seat: 0, amount: 4000 },
    ];
    expect(resultOf(events)).toEqual({ winner: 0, category: 'pair', showdown: true });
  });

  it('reports a split when the ranks are equal even if a refund makes the awards unequal', () => {
    const events: EngineEvent[] = [
      showdown([300, 300]),
      { type: 'potAwarded', seat: 0, amount: 3500 },
      { type: 'potAwarded', seat: 1, amount: 500 },
    ];
    expect(resultOf(events).winner).toBeNull();
  });

  it('names the player who got the pot when there is no showdown', () => {
    const events: EngineEvent[] = [{ type: 'potAwarded', seat: 1, amount: 60 }];
    expect(resultOf(events)).toEqual({ winner: 1, category: null, showdown: false });
  });
});

describe('potCollected', () => {
  it('is twice the matched contribution for a win', () => {
    expect(potCollected([60, 60], 0)).toBe(120);
  });

  it('excludes the uncalled refund', () => {
    expect(potCollected([500, 2000], 1)).toBe(1000);
    expect(potCollected([2000, 500], 1)).toBe(1000);
  });

  it('is each side share of the matched pot for a split', () => {
    expect(potCollected([60, 60], null)).toBe(60);
    expect(potCollected([500, 2000], null)).toBe(500);
  });
});
