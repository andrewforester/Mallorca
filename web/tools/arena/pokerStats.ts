import type { Action, EngineEvent, SeatIndex } from '../../src/engine/index.ts';

export interface Rate {
  rate: number;
  of: number;
}

const KEYS = [
  'steal',
  'limp',
  'bigBlindDefence',
  'threeBet',
  'foldToThreeBet',
  'continuationBet',
  'foldToContinuationBet',
  'donkBet',
  'checkRaise',
  'foldToFlopBet',
  'foldToTurnBet',
  'foldToRiverBet',
  'wentToShowdown',
  'wonAtShowdown',
] as const;

type Key = (typeof KEYS)[number];

export type PokerStats = { hands: number } & Record<Key, Rate>;

type Tally = Record<Key, { hit: number; of: number }>;

type Kind = Action['kind'];

type Acted = Extract<EngineEvent, { type: 'acted' }>;

const FOLD_TO_BET: Record<number, Key> = {
  1: 'foldToFlopBet',
  2: 'foldToTurnBet',
  3: 'foldToRiverBet',
};

interface HandState {
  me: SeatIndex;
  button: SeatIndex;
  street: number;
  committed: [number, number];
  raises: number;
  opener: SeatIndex | null;
  aggressor: SeatIndex | null;
  streetRaises: number;
  acted: boolean;
  checked: boolean;
  sawFlop: boolean;
  showdownPot: number;
  won: number;
}

const other = (seat: SeatIndex): SeatIndex => (seat === 0 ? 1 : 0);

function mark(tally: Tally, key: Key, hit: number | boolean): void {
  tally[key].hit += Number(hit);
  tally[key].of += 1;
}

function preflop(tally: Tally, s: HandState, kind: Kind, facing: boolean): void {
  const first = !s.acted;
  if (first && s.me === s.button && s.raises === 0) {
    mark(tally, 'steal', kind === 'raise');
    mark(tally, 'limp', kind === 'call');
  }
  const opened = s.raises === 1 && s.opener === other(s.me);
  if (first && opened && s.me !== s.button) {
    mark(tally, 'bigBlindDefence', kind === 'call' || kind === 'raise');
  }
  if (opened) mark(tally, 'threeBet', kind === 'raise');
  if (s.raises === 2 && s.opener === s.me && facing) mark(tally, 'foldToThreeBet', kind === 'fold');
}

function flop(tally: Tally, s: HandState, kind: Kind, facing: boolean): void {
  const opponent = other(s.me);
  const first = !s.acted && s.streetRaises === 0;
  if (first && s.aggressor === s.me) mark(tally, 'continuationBet', kind === 'raise');
  if (first && s.aggressor === opponent && s.me !== s.button) {
    mark(tally, 'donkBet', kind === 'raise');
  }
  if (facing && s.aggressor === opponent && s.streetRaises === 1) {
    mark(tally, 'foldToContinuationBet', kind === 'fold');
  }
}

function postflop(tally: Tally, s: HandState, kind: Kind, facing: boolean): void {
  if (s.street === 1) flop(tally, s, kind, facing);
  if (facing && s.checked) mark(tally, 'checkRaise', kind === 'raise');
  const key = FOLD_TO_BET[s.street];
  if (facing && key !== undefined) mark(tally, key, kind === 'fold');
}

function act(tally: Tally, s: HandState, event: Acted): void {
  const facing = s.committed[other(event.seat)] > s.committed[event.seat];
  const kind = event.action.kind;
  if (event.seat === s.me) {
    if (s.street === 0) preflop(tally, s, kind, facing);
    else postflop(tally, s, kind, facing);
    s.acted = true;
    s.checked ||= kind === 'check';
  }
  s.committed[event.seat] += event.amount;
  if (kind !== 'raise') return;
  s.streetRaises += 1;
  if (s.street > 0) return;
  s.raises += 1;
  s.opener ??= event.seat;
  s.aggressor = event.seat;
}

function dealt(s: HandState): void {
  s.street += 1;
  s.committed = [0, 0];
  s.streetRaises = 0;
  s.acted = false;
  s.checked = false;
  s.sawFlop = true;
}

function apply(tally: Tally, s: HandState, event: EngineEvent): void {
  if (event.type === 'handStarted') s.button = event.button;
  else if (event.type === 'blindPosted') s.committed[event.seat] += event.amount;
  else if (event.type === 'streetDealt') dealt(s);
  else if (event.type === 'acted') act(tally, s, event);
  else if (event.type === 'showdown') s.showdownPot = event.pot;
  else if (event.type === 'potAwarded' && event.seat === s.me && s.showdownPot > 0) {
    s.won += event.amount;
  }
}

function countHand(tally: Tally, events: EngineEvent[], me: SeatIndex): void {
  const s: HandState = {
    me,
    button: 0,
    street: 0,
    committed: [0, 0],
    raises: 0,
    opener: null,
    aggressor: null,
    streetRaises: 0,
    acted: false,
    checked: false,
    sawFlop: false,
    showdownPot: 0,
    won: 0,
  };
  for (const event of events) apply(tally, s, event);
  if (s.sawFlop) mark(tally, 'wentToShowdown', s.showdownPot > 0);
  if (s.showdownPot > 0) mark(tally, 'wonAtShowdown', s.won / s.showdownPot);
}

export function pokerStats(
  hands: EngineEvent[][],
  seatOf: (index: number) => SeatIndex,
): PokerStats {
  const tally = Object.fromEntries(KEYS.map((key) => [key, { hit: 0, of: 0 }])) as Tally;
  hands.forEach((events, index) => countHand(tally, events, seatOf(index)));
  const rates = Object.fromEntries(
    KEYS.map((key) => {
      const { hit, of } = tally[key];
      return [key, { rate: of === 0 ? 0 : hit / of, of }];
    }),
  ) as Record<Key, Rate>;
  return { hands: hands.length, ...rates };
}
