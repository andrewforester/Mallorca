import { describe, expect, it } from 'vitest';
import { suitFace } from './suits.ts';

describe('suitFace', () => {
  it('gives the glyph and the suit name of a card value', () => {
    expect(suitFace(0)).toEqual({ glyph: '♣', suit: 'clubs' });
    expect(suitFace(1)).toEqual({ glyph: '♦', suit: 'diamonds' });
    expect(suitFace(50)).toEqual({ glyph: '♥', suit: 'hearts' });
    expect(suitFace(51)).toEqual({ glyph: '♠', suit: 'spades' });
  });

  it('gives the same face for the text of a card', () => {
    expect(suitFace('2c')).toEqual({ glyph: '♣', suit: 'clubs' });
    expect(suitFace('Td')).toEqual({ glyph: '♦', suit: 'diamonds' });
    expect(suitFace('Ah')).toEqual({ glyph: '♥', suit: 'hearts' });
    expect(suitFace('Ks')).toEqual({ glyph: '♠', suit: 'spades' });
  });

  it('keeps an unknown suit character as it is', () => {
    expect(suitFace('A?')).toEqual({ glyph: '?', suit: null });
  });
});
