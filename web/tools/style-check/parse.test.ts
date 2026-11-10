import { describe, expect, it } from 'vitest';
import { parseCards } from '../../src/cards/index.ts';
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
import type { HandRecord } from '../../src/game/records/index.ts';
import { handRecord, MATH_BOT } from '../../src/game/records/record.ts';
import { parseHands } from './parse.ts';

const STYLE = { aggression: 0.78, bluff: 0.66, tightness: 0.74, sizing: 0.83, stickiness: 1.44 };

function recordOf(actions: Action[], styled: number[]): HandRecord {
  const deck = deckOf('Qs Qh', 'Ah Kd', '2c 7d 9h Ts 3s');
  const step = playEvents(startHand([2000, 1500], deck, 0), ...actions);
  const acted = step.events.flatMap((e, i) => (e.type === 'acted' ? [i] : []));
  const decisions = styled.map((k) => ({
    eventIndex: acted[k] ?? -1,
    solverChoice: 'call',
    evByAction: { fold: null, passive: null, aggressive: null },
    style: STYLE,
  }));
  return handRecord(step.events, decisions, {
    sessionId: 's1',
    mode: CASH,
    names: ['You', 'Mallorca'],
    humanSeat: 0,
    bot: MATH_BOT,
    playedAt: '2026-10-23T18:00:00.000Z',
  });
}

describe('parseHands', () => {
  const actions = [raiseTo(60), call, check, raiseTo(40), raiseTo(140), fold];
  const text = toFeelingsText([recordOf(actions, [1, 2, 4]), recordOf([fold], [])]);
  const [first, second] = parseHands(text);

  it('reads the seats, the button, the blinds and both hands', () => {
    expect(first?.names).toEqual(['You', 'Mallorca']);
    expect(first?.button).toBe(0);
    expect(first?.stacks).toEqual([2000, 1500]);
    expect(first?.blinds).toEqual({ small: 10, big: 20 });
    expect(first?.holes).toEqual([parseCards('Ah Kd'), parseCards('Qs Qh')]);
    expect(first?.board).toEqual(parseCards('2c 7d 9h'));
  });

  it('reads every action with its street and the style after her decisions', () => {
    expect(first?.actions.map((a) => [a.seat, a.street, a.action])).toEqual([
      [0, 0, raiseTo(60)],
      [1, 0, call],
      [1, 1, check],
      [0, 1, raiseTo(40)],
      [1, 1, raiseTo(140)],
      [0, 1, fold],
    ]);
    expect(first?.actions.map((a) => a.style)).toEqual([null, STYLE, STYLE, null, STYLE, null]);
  });

  it('splits the hands of a history', () => {
    expect(second?.actions).toHaveLength(1);
    expect(second?.board).toEqual([]);
  });
});
