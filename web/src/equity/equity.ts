import type { Card } from '../cards/index.ts';

export type WeightedHands = ReadonlyArray<{ cards: readonly [Card, Card]; weight: number }>;

export interface StreetEquity {
  strength: number;
  positivePotential: number;
  negativePotential: number;
}
