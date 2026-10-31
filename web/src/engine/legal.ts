import type { Action, Hand, LegalActions, Seat, SeatIndex } from './types.ts';

const NOTHING: LegalActions = { fold: false, check: false, call: null, raise: null };

export function otherSeat(seat: SeatIndex): SeatIndex {
  return seat === 0 ? 1 : 0;
}

export function legalActions(hand: Hand, seats: readonly [Seat, Seat]): LegalActions {
  const me = hand.toAct;
  if (me === null) {
    return NOTHING;
  }
  const opponent = otherSeat(me);
  const currentBet = Math.max(hand.bets[0], hand.bets[1]);
  const toCall = currentBet - hand.bets[me];
  const stack = seats[me].stack;
  const allIn = hand.bets[me] + stack;
  let raise: LegalActions['raise'] = null;
  if (hand.canRaise[me] && stack > toCall && seats[opponent].stack > 0) {
    const min = Math.min(currentBet + Math.max(hand.lastRaise, hand.bigBlind), allIn);
    raise = { min, max: allIn };
  }
  return {
    fold: toCall > 0,
    check: toCall === 0,
    call: toCall > 0 ? Math.min(toCall, stack) : null,
    raise,
  };
}

export function isLegal(legal: LegalActions, action: Action): boolean {
  switch (action.kind) {
    case 'fold':
      return legal.fold;
    case 'check':
      return legal.check;
    case 'call':
      return legal.call !== null;
    case 'raise':
      return (
        legal.raise !== null &&
        Number.isInteger(action.to) &&
        action.to >= legal.raise.min &&
        action.to <= legal.raise.max
      );
  }
}

export function checkOrCall(legal: LegalActions): Action {
  return legal.check ? { kind: 'check' } : { kind: 'call' };
}
