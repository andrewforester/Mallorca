import { describe, expect, it } from 'vitest';
import { CASH } from '../../../src/engine/index.ts';
import { handRecord } from '../../../src/game/records/record.ts';
import type { HandRecord } from '../../../src/game/records/record.ts';
import { BOTS } from '../bots.ts';
import type { BotName } from '../bots.ts';
import { playPair } from '../match.ts';
import { summarize as stats } from '../stats.ts';
import { cumulative, pairNets, pairRows, slices, summarize } from './analysis.ts';

const BB = 20;

function play(a: BotName, b: BotName, seed: number, pairs: number) {
  const records: HandRecord[] = [];
  const nets: number[] = [];
  for (let index = 0; index < pairs; index++) {
    const pair = playPair(BOTS[a], BOTS[b], seed, index);
    nets.push(pair.net);
    pair.hands.forEach((events, k) => {
      records.push(
        handRecord(events, [], {
          sessionId: `arena-${seed}`,
          mode: CASH,
          names: k === 0 ? [a, b] : [b, a],
          humanSeat: null,
          bot: { id: `${a}-vs-${b}`, version: '1' },
          playedAt: '2026-10-30T00:00:00.000Z',
        }),
      );
    });
  }
  return { hands: records.map((r, line) => summarize(r, line)), nets };
}

describe('summarize', () => {
  it('puts A on seat 0 in the first hand of a pair and on seat 1 in the second', () => {
    const { hands } = play('always-call', 'always-raise', 4, 8);
    expect(hands.map((h) => h.aSeat)).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
    expect(hands.map((h) => h.pair)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
    expect(hands.filter((h) => h.position === 'button')).toHaveLength(8);
    expect(hands.every((h) => h.pot > 0)).toBe(true);
  });

  it('takes the big blind of each hand from its start', () => {
    const { hands } = play('always-call', 'always-raise', 4, 2);
    expect(hands.map((h) => h.bigBlind)).toEqual([BB, BB, BB, BB]);
  });

  it('decides A by hand number when a bot plays itself', () => {
    const { hands, nets } = play('random', 'random', 7, 12);
    expect(pairNets(hands)).toEqual(nets);
  });
});

describe('pairNets', () => {
  it('equals the net of playPair and gives the run bb/100', () => {
    const { hands, nets } = play('always-call', 'always-raise', 4, 8);
    const fromHands = pairNets(hands);
    expect(fromHands).toEqual(nets);
    const mean = fromHands.reduce((s, n) => s + (n / 2 / BB) * 100, 0) / fromHands.length;
    expect(mean).toBeCloseTo(stats(nets, BB).bbPer100, 9);
  });
});

describe('cumulative', () => {
  it('keeps every pair when there are few', () => {
    expect(cumulative([20, -40, 60], BB)).toEqual([
      { pair: 1, bb: 1 },
      { pair: 2, bb: -1 },
      { pair: 3, bb: 2 },
    ]);
  });

  it('reduces to at most maxPoints and ends on the total', () => {
    const nets = Array.from({ length: 10_001 }, (_, i) => (i % 3) * 20 - 20);
    const points = cumulative(nets, BB, 600);
    expect(points.length).toBeLessThanOrEqual(600);
    const total = nets.reduce((s, n) => s + n, 0) / BB;
    expect(points.at(-1)).toEqual({ pair: 10_001, bb: total });
  });

  it('is empty without pairs', () => {
    expect(cumulative([], BB)).toEqual([]);
  });
});

describe('slices', () => {
  it('each group adds up to the total', () => {
    const { hands } = play('random', 'always-call', 5, 40);
    const total = hands.reduce((s, h) => s + h.aNet, 0) / BB;
    const s = slices(hands, BB);
    for (const group of [s.position, s.street, s.showdown]) {
      expect(group.reduce((sum, x) => sum + x.hands, 0)).toBe(hands.length);
      expect(group.reduce((sum, x) => sum + x.bb, 0)).toBeCloseTo(total, 9);
    }
    const button = s.position.find((x) => x.key === 'button')!;
    expect(button.bbPer100).toBeCloseTo((button.bb / button.hands) * 100, 9);
  });

  it('lists every street and both showdown keys even when empty', () => {
    const s = slices([], BB);
    expect(s.street.map((x) => x.key)).toEqual(['preflop', 'flop', 'turn', 'river']);
    expect(s.showdown.map((x) => x.key)).toEqual(['showdown', 'no-showdown']);
    expect(s.position.every((x) => x.hands === 0 && x.bbPer100 === 0)).toBe(true);
  });
});

describe('pairRows', () => {
  it('sorts by absolute pair net, largest first', () => {
    const { hands } = play('random', 'always-call', 5, 40);
    const rows = pairRows(hands, {}, 'net');
    expect(rows).toHaveLength(40);
    const sizes = rows.map((r) => Math.abs(r.net));
    expect(sizes).toEqual([...sizes].sort((x, y) => y - x));
    expect(rows[0]!.hands[0].aSeat).toBe(0);
    expect(rows[0]!.hands[1].aSeat).toBe(1);
  });

  it('sorts by the larger pot of the pair', () => {
    const { hands } = play('random', 'always-call', 5, 40);
    const pots = pairRows(hands, {}, 'pot').map((r) => r.pot);
    expect(pots).toEqual([...pots].sort((x, y) => y - x));
  });

  it('sorts a filtered list by the hands that match', () => {
    const { hands } = play('random', 'always-call', 5, 40);
    const rows = pairRows(hands, { position: 'bigBlind' }, 'net');
    expect(rows).toHaveLength(40);
    const sizes = rows.map((r) => Math.abs(r.hands[1].aNet));
    expect(sizes).toEqual([...sizes].sort((x, y) => y - x));
    expect(rows.every((r) => r.matches[0] === false && r.matches[1] === true)).toBe(true);
    const unfiltered = pairRows(hands, {}, 'net');
    expect(unfiltered.every((r) => r.matches[0] && r.matches[1])).toBe(true);
  });

  it('keeps a pair when either hand passes the filter', () => {
    const { hands } = play('random', 'always-call', 5, 40);
    const rows = pairRows(hands, { street: 'river', showdown: true }, 'net');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.hands.some((h) => h.street === 'river' && h.showdown)).toBe(true);
    }
    const all = pairRows(hands, {}, 'net').filter((r) =>
      r.hands.some((h) => h.street === 'river' && h.showdown),
    );
    expect(rows).toHaveLength(all.length);
  });
});
