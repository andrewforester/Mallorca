import { describe, expect, it } from 'vitest';
import { formatCard, parseCards } from '../cards/index.ts';
import type { Card } from '../cards/index.ts';
import { evaluateShowdown } from './showdown.ts';

const pair = (text: string) => parseCards(text) as [Card, Card];

describe('evaluateShowdown', () => {
  it('names the five cards each hand plays', () => {
    const hands = evaluateShowdown([pair('Ks 8d'), pair('Qd 5h')], parseCards('As Th 3h Ad Ts'));
    expect(hands[0].best.map(formatCard).sort()).toEqual(['Ad', 'As', 'Ks', 'Th', 'Ts']);
    expect(hands[1].best.map(formatCard).sort()).toEqual(['Ad', 'As', 'Qd', 'Th', 'Ts']);
  });
});
