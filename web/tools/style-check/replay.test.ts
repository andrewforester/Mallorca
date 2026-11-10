import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createCfrModel, inflate } from '../../src/cfr/index.ts';
import type { CfrModel } from '../../src/cfr/index.ts';
import { SHIPPED_STRATEGIES, WASM_URL } from '../../src/cfr/strategies.ts';
import { CASH } from '../../src/engine/index.ts';
import type { Action } from '../../src/engine/index.ts';
import {
  call,
  check,
  deckOf,
  fold,
  playEvents,
  raiseTo,
  startHand,
} from '../../src/engine/testDeck.ts';
import { toFeelingsText } from '../../src/game/records/index.ts';
import { handRecord, MATH_BOT } from '../../src/game/records/record.ts';
import type { BotBias } from '../../src/brains/index.ts';
import { parseHands } from './parse.ts';
import { decisionsOf, NEUTRAL } from './replay.ts';
import { report } from './report.ts';

let model: CfrModel;

beforeAll(async () => {
  model = await createCfrModel(
    readFileSync(WASM_URL),
    await inflate(readFileSync(SHIPPED_STRATEGIES.cfr.url)),
  );
});

function textOf(actions: Action[], style: BotBias): string {
  const deck = deckOf('Ah Kd', 'Qs 7c', '2c 7d 9h Ts 3s');
  const step = playEvents(startHand([2000, 2000], deck, 0), ...actions);
  const decisions = step.events.flatMap((e, i) =>
    e.type === 'acted' && e.seat === 1
      ? [
          {
            eventIndex: i,
            solverChoice: 'call',
            evByAction: { fold: null, passive: null, aggressive: null },
            style,
          },
        ]
      : [],
  );
  const record = handRecord(step.events, decisions, {
    sessionId: 's1',
    mode: CASH,
    names: ['You', 'Mallorca'],
    humanSeat: 0,
    bot: MATH_BOT,
    playedAt: '2026-10-23T18:00:00.000Z',
  });
  return toFeelingsText([record]);
}

const line = [raiseTo(60), call, check, raiseTo(60), call, check, check, check, raiseTo(150), fold];

describe('decisionsOf', () => {
  it('replays each of her decisions with the blueprint and her style', () => {
    const [hand] = parseHands(textOf(line, NEUTRAL));
    const decisions = decisionsOf(model, hand!);
    expect(decisions.map((d) => d.index)).toEqual([1, 2, 4, 5, 7, 9]);
    for (const d of decisions) {
      expect(d.styled).toEqual(d.base);
      expect(d.played).not.toBeNull();
      expect(d.base.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    }
    expect(decisions[0]?.classes).toContain('fold');
    expect(decisions[1]?.classes).not.toContain('fold');
  });

  it('attributes the moves of a strong style to the axes', () => {
    const style = { aggression: 1.6, bluff: 1.5, tightness: 0.6, sizing: 1.5, stickiness: 2 };
    const [hand] = parseHands(textOf(line, style));
    const decisions = decisionsOf(model, hand!);
    for (const d of decisions) expect(d.only.sizing.length).toBe(d.base.length);
    expect(
      decisions.some((d) => d.styled.some((v, i) => Math.abs(v - (d.base[i] ?? 0)) > 0.01)),
    ).toBe(true);
    const flop = decisions.find((d) => d.street === 1 && d.classes.includes('fold'));
    const fold = (row: number[] | undefined) => row?.[flop?.classes.indexOf('fold') ?? 0] ?? 0;
    expect(fold(flop?.styled)).toBeLessThanOrEqual(fold(flop?.base) + 1e-9);
  });

  it('uses a style given for the whole hand when the text has none', () => {
    const [hand] = parseHands(textOf(line, NEUTRAL).replaceAll(/\n\s*~ style:[^\n]*/g, ''));
    expect(decisionsOf(model, hand!)).toEqual([]);
    const style = { ...NEUTRAL, aggression: 0.7 };
    expect(decisionsOf(model, hand!, { style }).map((d) => d.her)).toEqual([
      0, 1, 1, 0, 1, 1, 0, 1, 0, 1,
    ]);
    const hers = decisionsOf(model, hand!, { style, her: 1 });
    expect(hers.map((d) => d.index)).toEqual([1, 2, 4, 5, 7, 9]);
  });

  it('writes a report with a table per decision', () => {
    const style = { ...NEUTRAL, stickiness: 1.44 };
    const [hand] = parseHands(textOf(line, style));
    const text = report(decisionsOf(model, hand!));
    expect(text).toContain('# Style check');
    expect(text).toContain('6 decisions of her');
    expect(text).not.toMatch(/rule|Error|Note/);
    expect(text).toContain('| Move | Blueprint | Her style | stickiness alone |');
    expect(text).toContain('(played)');
    expect(text).toContain('### Decision 2: flop, Mallorca holds');
  });
});
