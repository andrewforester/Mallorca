import { formatCard } from '../cards/index.ts';
import type { Card } from '../cards/index.ts';
import type { SeatIndex } from '../engine/index.ts';
import type { Occasion } from './types.ts';

export interface PublicFacts {
  street: string;
  board: Card[];
  potBb: number;
  stacksBb: { her: number; player: number };
  actions: string[];
  card: Card | null;
  result: { won: boolean; potBb: number } | null;
  shown: { her: [Card, Card]; player: [Card, Card] } | null;
}

const WHERE: Readonly<Record<string, string>> = {
  preflop: 'before the flop',
  flop: 'on the flop',
  turn: 'on the turn',
  river: 'on the river',
};

const other = (seat: SeatIndex): SeatIndex => (seat === 0 ? 1 : 0);

const round = (v: number): number => Math.round(v * 10) / 10;

export function publicFacts(occasion: Occasion, seat: SeatIndex): PublicFacts {
  const { hand } = occasion;
  const bb = hand.bigBlind;
  const dealt = occasion.kind === 'card' && occasion.actionStreet !== 'flop';
  const potBb = hand.pot / bb;
  const showdown = hand.showdown;
  return {
    street: hand.street,
    board: [...hand.board],
    potBb,
    stacksBb: { her: hand.stacks[seat] / bb, player: hand.stacks[other(seat)] / bb },
    actions: [...hand.actions],
    card: dealt ? (hand.board[hand.board.length - 1] ?? null) : null,
    result: occasion.endsHand ? { won: hand.awarded[seat] > 0, potBb } : null,
    shown:
      showdown === null ? null : { her: showdown[seat].cards, player: showdown[other(seat)].cards },
  };
}

function endText(occasion: Occasion, facts: PublicFacts): string {
  const pot = `a ${round(facts.potBb)} bb pot`;
  if (occasion.end === 'bluffCaught') {
    return `the player called your bet and you lost ${pot}`;
  }
  if (occasion.end === 'playerBluffShown') {
    return `the player bet the river and showed a bluff; you won ${pot}`;
  }
  return occasion.end === 'won' ? `you won ${pot}` : `you lost ${pot}`;
}

function cardText(occasion: Occasion, facts: PublicFacts): string {
  const came = facts.card === null ? facts.board.map(formatCard).join(' ') : formatCard(facts.card);
  return `the ${occasion.actionStreet} came ${came}`;
}

export function occasionText(occasion: Occasion, facts: PublicFacts): string {
  const where = WHERE[occasion.actionStreet] ?? 'in this hand';
  switch (occasion.kind) {
    case 'herBet':
      return `you bet ${where}`;
    case 'herCall':
      return `you stayed in ${where}`;
    case 'herFold':
      return `you folded ${where}`;
    case 'playerRaise':
      return `the player raised ${where}`;
    case 'card':
      return cardText(occasion, facts);
    case 'handEnded':
      return endText(occasion, facts);
    case 'playerSaid':
      return 'the player said something';
  }
}
