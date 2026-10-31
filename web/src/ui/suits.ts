import { formatCard } from '../game/index.ts';
import type { Card } from '../game/index.ts';

const GLYPHS: Record<string, string> = { c: '♣', d: '♦', h: '♥', s: '♠' };

export interface SuitFace {
  glyph: string;
  red: boolean;
}

export function suitFace(card: Card | string): SuitFace {
  const suit = (typeof card === 'string' ? card : formatCard(card)).slice(-1);
  return { glyph: GLYPHS[suit] ?? suit, red: suit === 'd' || suit === 'h' };
}
