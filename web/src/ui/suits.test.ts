import { describe, expect, it } from 'vitest';
import { suitFace } from './suits.ts';

describe('suitFace', () => {
  it('gives the glyph and the colour of a card value', () => {
    expect(suitFace(0)).toEqual({ glyph: '♣', red: false });
    expect(suitFace(1)).toEqual({ glyph: '♦', red: true });
    expect(suitFace(50)).toEqual({ glyph: '♥', red: true });
    expect(suitFace(51)).toEqual({ glyph: '♠', red: false });
  });

  it('gives the same face for the text of a card', () => {
    expect(suitFace('2c')).toEqual({ glyph: '♣', red: false });
    expect(suitFace('Td')).toEqual({ glyph: '♦', red: true });
    expect(suitFace('Ah')).toEqual({ glyph: '♥', red: true });
    expect(suitFace('Ks')).toEqual({ glyph: '♠', red: false });
  });

  it('keeps an unknown suit character as it is', () => {
    expect(suitFace('A?')).toEqual({ glyph: '?', red: false });
  });
});
