import { describe, expect, it } from 'vitest';
import { BOARD_SIZE } from './streets.ts';
import { call, deckOf, playEvents, raiseTo, startHand } from './testDeck.ts';

describe('BOARD_SIZE', () => {
  it('is the board length after each street is dealt', () => {
    const step = playEvents(
      startHand([2000, 2000], deckOf('Ah Ad', '7c 2d', 'Kc 9d 4s 6h Jc')),
      raiseTo(2000),
      call,
    );
    const dealt = step.events.flatMap((e) => (e.type === 'streetDealt' ? [e] : []));
    expect(dealt.map((e) => [e.street, e.board.length])).toEqual([
      ['flop', BOARD_SIZE.flop],
      ['turn', BOARD_SIZE.turn],
      ['river', BOARD_SIZE.river],
    ]);
  });

  it('has no board preflop and five cards on the river', () => {
    expect(BOARD_SIZE).toEqual({ preflop: 0, flop: 3, turn: 4, river: 5 });
  });
});
