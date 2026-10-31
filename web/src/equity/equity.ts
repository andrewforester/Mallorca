import type { Card } from '../cards/index.ts';

export type WeightedHands = ReadonlyArray<{ cards: readonly [Card, Card]; weight: number }>;
