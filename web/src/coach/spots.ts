import type { BettingStreet, EngineEvent, SeatIndex } from '../engine/index.ts';

export type SpotTag =
  | 'open'
  | 'threeBet'
  | 'foldToThreeBet'
  | 'cbet'
  | 'foldToCbet'
  | 'turnBet'
  | 'riverBet'
  | 'riverFold';

interface Walk {
  street: BettingStreet;
  button: SeatIndex | null;
  preflopRaisers: SeatIndex[];
  raisers: SeatIndex[];
  acted: SeatIndex[];
}

function step(state: Walk, event: EngineEvent): void {
  if (event.type === 'handStarted') {
    state.button = event.button;
  } else if (event.type === 'streetDealt') {
    state.street = event.street;
    state.raisers = [];
    state.acted = [];
  } else if (event.type === 'acted') {
    state.acted.push(event.seat);
    if (event.action.kind !== 'raise') return;
    state.raisers.push(event.seat);
    if (state.street === 'preflop') state.preflopRaisers.push(event.seat);
  }
}

function walk(events: readonly EngineEvent[]): Walk {
  const state: Walk = {
    street: 'preflop',
    button: null,
    preflopRaisers: [],
    raisers: [],
    acted: [],
  };
  for (const event of events) step(state, event);
  return state;
}

function preflopSpot(state: Walk, seat: SeatIndex): SpotTag | null {
  const raises = state.preflopRaisers;
  if (raises.length === 0) {
    return state.button === seat && !state.acted.includes(seat) ? 'open' : null;
  }
  const facing = raises[raises.length - 1] !== seat;
  if (!facing) return null;
  if (raises.length === 1 && !state.acted.includes(seat)) return 'threeBet';
  return raises.length === 2 && raises[0] === seat ? 'foldToThreeBet' : null;
}

function flopSpot(state: Walk, seat: SeatIndex): SpotTag | null {
  const aggressor = state.preflopRaisers[state.preflopRaisers.length - 1];
  if (aggressor === undefined) return null;
  if (aggressor === seat) return state.raisers.length === 0 ? 'cbet' : null;
  return state.raisers.length === 1 && state.raisers[0] === aggressor ? 'foldToCbet' : null;
}

export function spotOf(events: readonly EngineEvent[], seat: SeatIndex): SpotTag | null {
  const state = walk(events);
  const last = state.raisers[state.raisers.length - 1];
  const facing = last !== undefined && last !== seat;
  switch (state.street) {
    case 'preflop':
      return preflopSpot(state, seat);
    case 'flop':
      return flopSpot(state, seat);
    case 'turn':
      return facing ? null : 'turnBet';
    case 'river':
      return facing ? 'riverFold' : 'riverBet';
  }
}
