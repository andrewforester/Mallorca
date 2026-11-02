import { describe, expect, it } from 'vitest';
import { cardOf, formatCard, fullDeck, parseCard, parseCards, rankOf, suitOf } from './card.ts';

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const allCards = [...RANKS].flatMap((r) => [...SUITS].map((s) => `${r}${s}`));

describe('card', () => {
  it('encodes the lowest and highest cards', () => {
    expect(parseCard('2c')).toBe(0);
    expect(parseCard('As')).toBe(51);
  });

  it('reads rank and suit', () => {
    expect(rankOf(parseCard('2c'))).toBe(2);
    expect(rankOf(parseCard('Td'))).toBe(10);
    expect(rankOf(parseCard('As'))).toBe(14);
    expect(suitOf(parseCard('2c'))).toBe(0);
    expect(suitOf(parseCard('9d'))).toBe(1);
    expect(suitOf(parseCard('Kh'))).toBe(2);
    expect(suitOf(parseCard('As'))).toBe(3);
  });

  it('builds a card from its rank and suit', () => {
    expect(cardOf(2, 0)).toBe(parseCard('2c'));
    expect(cardOf(10, 1)).toBe(parseCard('Td'));
    expect(cardOf(14, 3)).toBe(parseCard('As'));
    for (const card of fullDeck()) {
      expect(cardOf(rankOf(card), suitOf(card))).toBe(card);
    }
  });

  it('round trips every card through text', () => {
    for (const text of allCards) {
      expect(formatCard(parseCard(text))).toBe(text);
    }
  });

  it('parses a space separated list', () => {
    expect(parseCards('As Kd')).toEqual([parseCard('As'), parseCard('Kd')]);
    expect(parseCards('As Kd')).toHaveLength(2);
    expect(parseCards('')).toEqual([]);
  });

  it('rejects malformed cards', () => {
    expect(() => parseCard('Xx')).toThrow();
    expect(() => parseCard('A')).toThrow();
    expect(() => parseCard('Asd')).toThrow();
    expect(() => parseCard('1c')).toThrow();
    expect(() => parseCard('Ax')).toThrow();
  });

  it('builds a full deck of 52 unique cards', () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
    expect(Math.min(...deck)).toBe(0);
    expect(Math.max(...deck)).toBe(51);
  });

  it('returns a fresh deck each call', () => {
    const deck = fullDeck();
    deck.pop();
    expect(fullDeck()).toHaveLength(52);
  });
});
