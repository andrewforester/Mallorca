import type { Card } from '../cards/index.ts';
import { isLegal, legalActions, otherSeat } from './legal.ts';
import { awardShowdown, evaluateShowdown } from './showdown.ts';
import type { Action, EngineEvent, Hand, Seat, SeatIndex, Step } from './types.ts';

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

type Stacks = [number, number];

interface Table {
  hand: Hand;
  stacks: Stacks;
  seats: readonly [Seat, Seat];
  events: EngineEvent[];
}

interface Payout {
  awards: Stacks;
  refund: Stacks;
}

const STREET_BY_BOARD_SIZE = { 0: 'flop', 3: 'turn', 4: 'river' } as const;
const CARDS_BY_STREET = { flop: 3, turn: 1, river: 1 } as const;

function pair<T>(first: T, second: T): [T, T] {
  return [first, second];
}

function withSeats(seats: readonly [Seat, Seat], stacks: Stacks): [Seat, Seat] {
  return [
    { ...seats[0], stack: stacks[0] },
    { ...seats[1], stack: stacks[1] },
  ];
}

function put(
  hand: Hand,
  stacks: Stacks,
  seat: SeatIndex,
  amount: number,
): { hand: Hand; stacks: Stacks } {
  const bets = pair(hand.bets[0], hand.bets[1]);
  const committed = pair(hand.committed[0], hand.committed[1]);
  const nextStacks = pair(stacks[0], stacks[1]);
  bets[seat] += amount;
  committed[seat] += amount;
  nextStacks[seat] -= amount;
  return {
    hand: { ...hand, bets, committed, pot: committed[0] + committed[1] },
    stacks: nextStacks,
  };
}

export function startHandWith(
  seats: [Seat, Seat],
  deal: { button: SeatIndex; blinds: { small: number; big: number }; handNumber: number },
  deck: Card[],
): Step {
  const { button, blinds, handNumber } = deal;
  const bigBlindSeat = otherSeat(button);
  const events: EngineEvent[] = [
    {
      type: 'handStarted',
      handNumber,
      button,
      smallBlind: blinds.small,
      bigBlind: blinds.big,
      stacks: [seats[0].stack, seats[1].stack],
    },
  ];
  const dealt: [Card[], Card[]] = [[], []];
  dealt[bigBlindSeat].push(deck[0] as Card, deck[2] as Card);
  dealt[button].push(deck[1] as Card, deck[3] as Card);
  const holeCards: Hand['holeCards'] = [
    [dealt[0][0] as Card, dealt[0][1] as Card],
    [dealt[1][0] as Card, dealt[1][1] as Card],
  ];
  let state = {
    hand: {
      street: 'preflop',
      button,
      deck: deck.slice(4),
      holeCards,
      board: [],
      bets: [0, 0],
      committed: [0, 0],
      pot: 0,
      toAct: null,
      lastRaise: blinds.big,
      actedThisStreet: [false, false],
      canRaise: [true, true],
      bigBlind: blinds.big,
    } as Hand,
    stacks: pair(seats[0].stack, seats[1].stack),
  };
  const small = Math.min(blinds.small, state.stacks[button]);
  state = put(state.hand, state.stacks, button, small);
  events.push({ type: 'blindPosted', seat: button, amount: small });
  const big = Math.min(blinds.big, state.stacks[bigBlindSeat]);
  state = put(state.hand, state.stacks, bigBlindSeat, big);
  events.push({ type: 'blindPosted', seat: bigBlindSeat, amount: big });
  events.push({ type: 'holeCards', seat: bigBlindSeat, cards: holeCards[bigBlindSeat] });
  events.push({ type: 'holeCards', seat: button, cards: holeCards[button] });
  return settle({ hand: state.hand, stacks: state.stacks, seats, events }, bigBlindSeat);
}

function needsAction(hand: Hand, stacks: Stacks, seat: SeatIndex): boolean {
  if (stacks[seat] === 0) {
    return false;
  }
  const currentBet = Math.max(hand.bets[0], hand.bets[1]);
  if (hand.bets[seat] < currentBet) {
    return true;
  }
  return !hand.actedThisStreet[seat] && stacks[otherSeat(seat)] > 0;
}

function settle(table: Table, last: SeatIndex): Step {
  const { hand, stacks, seats, events } = table;
  const opponent = otherSeat(last);
  if (needsAction(hand, stacks, opponent)) {
    return { hand: { ...hand, toAct: opponent }, seats: withSeats(seats, stacks), events };
  }
  if (needsAction(hand, stacks, last)) {
    return { hand: { ...hand, toAct: last }, seats: withSeats(seats, stacks), events };
  }
  return closeBetting(table);
}

function dealStreet(hand: Hand, events: EngineEvent[], pot: number): Hand {
  const street = STREET_BY_BOARD_SIZE[hand.board.length as 0 | 3 | 4];
  const count = CARDS_BY_STREET[street];
  const cards = hand.deck.slice(0, count);
  const board = [...hand.board, ...cards];
  events.push({ type: 'streetDealt', street, cards, board, pot });
  return { ...hand, street, deck: hand.deck.slice(count), board };
}

function closeBetting(table: Table): Step {
  const { hand, stacks, seats, events } = table;
  const bothCanBet = stacks[0] > 0 && stacks[1] > 0;
  if (bothCanBet && hand.street !== 'river') {
    const next = dealStreet(hand, events, hand.pot);
    return {
      hand: {
        ...next,
        bets: [0, 0],
        lastRaise: hand.bigBlind,
        actedThisStreet: [false, false],
        canRaise: [true, true],
        toAct: otherSeat(hand.button),
      },
      seats: withSeats(seats, stacks),
      events,
    };
  }
  return showdown(table);
}

function showdown(table: Table): Step {
  const { hand, events } = table;
  const refund: Stacks = [0, 0];
  const committed = pair(hand.committed[0], hand.committed[1]);
  if (hand.bets[0] !== hand.bets[1]) {
    const bigger: SeatIndex = hand.bets[0] > hand.bets[1] ? 0 : 1;
    const excess = Math.abs(hand.bets[0] - hand.bets[1]);
    refund[bigger] = excess;
    committed[bigger] -= excess;
  }
  const pot = committed[0] + committed[1];
  let current: Hand = hand;
  while (current.board.length < 5) {
    current = dealStreet(current, events, pot);
  }
  const hands = evaluateShowdown(current.holeCards, current.board);
  events.push({ type: 'showdown', hands, pot });
  const awards = awardShowdown(pot, [hands[0].rank, hands[1].rank], otherSeat(hand.button));
  return finish({ ...table, hand: current }, { awards, refund });
}

function finish(table: Table, payout: Payout): Step {
  const { hand, stacks, seats, events } = table;
  const { awards, refund } = payout;
  const final: Stacks = [stacks[0] + awards[0] + refund[0], stacks[1] + awards[1] + refund[1]];
  for (const seat of [0, 1] as const) {
    if (refund[seat] > 0) {
      events.push({ type: 'betReturned', seat, amount: refund[seat] });
    }
  }
  for (const seat of [0, 1] as const) {
    if (awards[seat] > 0) {
      events.push({ type: 'potAwarded', seat, amount: awards[seat] });
    }
  }
  events.push({ type: 'handEnded', stacks: final });
  return {
    hand: {
      ...hand,
      street: 'complete',
      toAct: null,
      bets: [0, 0],
      pot: 0,
      canRaise: [false, false],
    },
    seats: withSeats(seats, final),
    events,
  };
}

function assertLegal(hand: Hand, seats: readonly [Seat, Seat], action: Action): void {
  const legal = legalActions(hand, seats);
  if (hand.toAct === null) {
    throw new IllegalActionError('Nobody is to act');
  }
  if (!isLegal(legal, action)) {
    throw new IllegalActionError(`Illegal action: ${JSON.stringify(action)}`);
  }
}
export function applyAction(hand: Hand, seats: [Seat, Seat], action: Action): Step {
  assertLegal(hand, seats, action);
  const me = hand.toAct as SeatIndex;
  const events: EngineEvent[] = [];
  const stacks: Stacks = [seats[0].stack, seats[1].stack];
  const acted = pair(hand.actedThisStreet[0], hand.actedThisStreet[1]);
  acted[me] = true;
  let current: Hand = { ...hand, actedThisStreet: acted };
  if (action.kind === 'fold') {
    events.push({ type: 'acted', seat: me, action, amount: 0, allIn: false });
    const winner = otherSeat(me);
    const excess = Math.max(hand.committed[winner] - hand.committed[me], 0);
    const awards: Stacks = [0, 0];
    const refund: Stacks = [0, 0];
    awards[winner] = hand.pot - excess;
    refund[winner] = excess;
    return finish({ hand: current, stacks, seats, events }, { awards, refund });
  }
  const currentBet = Math.max(hand.bets[0], hand.bets[1]);
  let amount = 0;
  if (action.kind === 'call') {
    amount = Math.min(currentBet - hand.bets[me], stacks[me]);
  } else if (action.kind === 'raise') {
    amount = action.to - hand.bets[me];
  }
  const moved = put(current, stacks, me, amount);
  current = moved.hand;
  if (action.kind === 'raise') {
    const increment = action.to - currentBet;
    const canRaise = pair(current.canRaise[0], current.canRaise[1]);
    if (increment >= Math.max(hand.lastRaise, hand.bigBlind)) {
      current = { ...current, lastRaise: increment };
      canRaise[otherSeat(me)] = true;
    } else {
      canRaise[otherSeat(me)] = false;
    }
    current = { ...current, canRaise };
  }
  events.push({ type: 'acted', seat: me, action, amount, allIn: moved.stacks[me] === 0 });
  return settle({ hand: current, stacks: moved.stacks, seats, events }, me);
}
