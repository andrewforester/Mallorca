import type { Card } from '../../src/cards/index.ts';
import type { EngineEvent, SeatIndex } from '../../src/engine/index.ts';
import { pheEvaluator } from '../../src/equity/index.ts';

export const BLUFF_STRENGTH = 0.35;

export interface StyleStats {
  hands: number;
  vpip: number;
  pfr: number;
  aggressionFactor: number;
  betFrequency: number;
  foldToBet: number;
  raiseFrequency: number;
  postflopDecisions: number;
  facedBets: number;
  betSize: number;
  preflopRaiseSize: number;
  riverBets: number;
  riverBluffShare: number;
}

interface Counts {
  voluntary: number;
  preflopRaised: number;
  decisions: number;
  aggressive: number;
  calls: number;
  faced: number;
  foldsFacing: number;
  raisesFacing: number;
  betSizes: number;
  preflopSizes: number;
  preflopRaises: number;
  riverBets: number;
  riverBluffs: number;
}

export function riverStrength(hole: readonly Card[], board: readonly Card[]): number {
  const dead = new Set([...hole, ...board]);
  const deck: Card[] = [];
  for (let card = 0; card < 52; card += 1) if (!dead.has(card)) deck.push(card);
  const mine = pheEvaluator.rank([...hole, ...board]);
  let beaten = 0;
  let total = 0;
  for (let i = 0; i < deck.length; i += 1) {
    for (let j = i + 1; j < deck.length; j += 1) {
      const theirs = pheEvaluator.rank([deck[i] ?? 0, deck[j] ?? 0, ...board]);
      beaten += mine > theirs ? 1 : mine === theirs ? 0.5 : 0;
      total += 1;
    }
  }
  return beaten / total;
}

function countRiverBet(counts: Counts, hole: readonly Card[], board: readonly Card[]): void {
  counts.riverBets += 1;
  if (riverStrength(hole, board) < BLUFF_STRENGTH) counts.riverBluffs += 1;
}

const ratio = (part: number, whole: number): number => (whole === 0 ? 0 : part / whole);

function countPostflop(counts: Counts, kind: string, facing: boolean): void {
  counts.decisions += 1;
  if (kind === 'raise') counts.aggressive += 1;
  if (kind === 'call') counts.calls += 1;
  if (!facing) return;
  counts.faced += 1;
  if (kind === 'fold') counts.foldsFacing += 1;
  if (kind === 'raise') counts.raisesFacing += 1;
}

function countSize(counts: Counts, postflop: boolean, size: number): void {
  if (postflop) {
    counts.betSizes += size;
  } else {
    counts.preflopSizes += size;
    counts.preflopRaises += 1;
  }
}

function countHand(counts: Counts, events: EngineEvent[], seat: SeatIndex): void {
  const committed = [0, 0];
  let pot = 0;
  let postflop = false;
  let voluntary = false;
  let raised = false;
  let board: readonly Card[] = [];
  let hole: readonly Card[] = [];
  for (const event of events) {
    if (event.type === 'holeCards' && event.seat === seat) {
      hole = event.cards;
    } else if (event.type === 'blindPosted') {
      committed[event.seat] = (committed[event.seat] ?? 0) + event.amount;
      pot += event.amount;
    } else if (event.type === 'streetDealt') {
      committed.fill(0);
      postflop = true;
      board = event.board;
    } else if (event.type === 'acted') {
      const facing = (committed[1 - event.seat] ?? 0) > (committed[event.seat] ?? 0);
      committed[event.seat] = (committed[event.seat] ?? 0) + event.amount;
      const before = pot;
      pot += event.amount;
      if (event.seat !== seat) continue;
      const kind = event.action.kind;
      if (kind === 'raise' && before > 0) countSize(counts, postflop, event.amount / before);
      if (kind === 'raise' && board.length === 5) countRiverBet(counts, hole, board);
      if (postflop) countPostflop(counts, kind, facing);
      else if (kind === 'call' || kind === 'raise') {
        voluntary = true;
        raised ||= kind === 'raise';
      }
    }
  }
  if (voluntary) counts.voluntary += 1;
  if (raised) counts.preflopRaised += 1;
}

export function styleStats(
  hands: EngineEvent[][],
  seatOf: (index: number) => SeatIndex,
): StyleStats {
  const counts: Counts = {
    voluntary: 0,
    preflopRaised: 0,
    decisions: 0,
    aggressive: 0,
    calls: 0,
    faced: 0,
    foldsFacing: 0,
    raisesFacing: 0,
    betSizes: 0,
    preflopSizes: 0,
    preflopRaises: 0,
    riverBets: 0,
    riverBluffs: 0,
  };
  hands.forEach((events, index) => countHand(counts, events, seatOf(index)));
  return {
    hands: hands.length,
    vpip: ratio(counts.voluntary, hands.length),
    pfr: ratio(counts.preflopRaised, hands.length),
    aggressionFactor:
      counts.calls === 0 && counts.aggressive > 0
        ? Infinity
        : ratio(counts.aggressive, counts.calls),
    betFrequency: ratio(counts.aggressive, counts.decisions),
    foldToBet: ratio(counts.foldsFacing, counts.faced),
    raiseFrequency: ratio(counts.raisesFacing, counts.faced),
    postflopDecisions: counts.decisions,
    facedBets: counts.faced,
    betSize: ratio(counts.betSizes, counts.aggressive),
    preflopRaiseSize: ratio(counts.preflopSizes, counts.preflopRaises),
    riverBets: counts.riverBets,
    riverBluffShare: ratio(counts.riverBluffs, counts.riverBets),
  };
}
