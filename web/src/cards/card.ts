export type Card = number;
export type Suit = 0 | 1 | 2 | 3;

const RANK_CHARS = '23456789TJQKA';
const SUIT_CHARS = 'cdhs';
const DECK_SIZE = 52;

export function rankOf(card: Card): number {
  return (card >> 2) + 2;
}

export function suitOf(card: Card): Suit {
  return (card & 3) as Suit;
}

export function cardOf(rank: number, suit: Suit): Card {
  return (rank - 2) * 4 + suit;
}

export function parseCard(text: string): Card {
  const rank = text.length === 2 ? RANK_CHARS.indexOf(text.charAt(0)) : -1;
  const suit = text.length === 2 ? SUIT_CHARS.indexOf(text.charAt(1)) : -1;
  if (rank < 0 || suit < 0) {
    throw new Error(`Invalid card: ${text}`);
  }
  return cardOf(rank + 2, suit as Suit);
}

export function parseCards(text: string): Card[] {
  const trimmed = text.trim();
  return trimmed === '' ? [] : trimmed.split(/\s+/).map(parseCard);
}

export function formatCard(card: Card): string {
  return `${RANK_CHARS.charAt(card >> 2)}${SUIT_CHARS.charAt(card & 3)}`;
}

export function fullDeck(): Card[] {
  return Array.from({ length: DECK_SIZE }, (_, i) => i);
}
