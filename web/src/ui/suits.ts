import { formatCard } from '../game/index.ts';
import type { Card } from '../game/index.ts';

export type SuitName = 'clubs' | 'diamonds' | 'hearts' | 'spades';

const FACES: Record<string, { glyph: string; suit: SuitName }> = {
  c: { glyph: '♣', suit: 'clubs' },
  d: { glyph: '♦', suit: 'diamonds' },
  h: { glyph: '♥', suit: 'hearts' },
  s: { glyph: '♠', suit: 'spades' },
};

export interface SuitFace {
  glyph: string;
  suit: SuitName | null;
}

export function suitFace(card: Card | string): SuitFace {
  const letter = (typeof card === 'string' ? card : formatCard(card)).slice(-1);
  return FACES[letter] ?? { glyph: letter, suit: null };
}
