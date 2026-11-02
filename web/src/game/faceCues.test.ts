import { describe, expect, it } from 'vitest';
import { parseCards } from '../cards/index.ts';
import type { EngineEvent } from '../engine/index.ts';
import { gazeOf } from './faceCues.ts';

const acted = (seat: 0 | 1, kind: 'fold' | 'check' | 'call' | 'raise'): EngineEvent =>
  ({
    type: 'acted',
    seat,
    action: kind === 'raise' ? { kind, to: 60 } : { kind },
    amount: 0,
  }) as EngineEvent;

const hole = (seat: 0 | 1): EngineEvent =>
  ({ type: 'holeCards', seat, cards: parseCards('Ah Kd') }) as EngineEvent;

describe('gazeOf', () => {
  it('looks at her cards when she is dealt', () => {
    expect(gazeOf([hole(1)], 0)).toBeNull();
    expect(gazeOf([hole(0), hole(1)], 1)).toEqual({ target: 'cards', then: null });
  });

  it('looks at the chips and back at the player when she puts money in', () => {
    expect(gazeOf([acted(1, 'raise')], 1)).toEqual({ target: 'chips', then: 'player' });
    expect(gazeOf([acted(1, 'call')], 1)).toEqual({ target: 'chips', then: 'player' });
    expect(gazeOf([acted(1, 'check')], 1)).toEqual({ target: 'player', then: null });
  });

  it('watches the player act and the board when a street is dealt', () => {
    expect(gazeOf([acted(0, 'raise')], 1)).toEqual({ target: 'player', then: null });
    const street = { type: 'streetDealt', street: 'flop', board: [], pot: 40 } as unknown;
    expect(gazeOf([acted(0, 'call'), street as EngineEvent], 1)).toEqual({
      target: 'board',
      then: null,
    });
  });

  it('meets the player at the end of a hand and ignores the rest', () => {
    expect(gazeOf([{ type: 'handEnded' } as EngineEvent], 1)).toEqual({
      target: 'player',
      then: null,
    });
    expect(gazeOf([], 1)).toBeNull();
  });
});
