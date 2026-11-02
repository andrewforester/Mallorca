import type { EngineEvent, SeatIndex } from '../../src/engine/index.ts';

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
  for (const event of events) {
    if (event.type === 'blindPosted') {
      committed[event.seat] = (committed[event.seat] ?? 0) + event.amount;
      pot += event.amount;
    } else if (event.type === 'streetDealt') {
      committed.fill(0);
      postflop = true;
    } else if (event.type === 'acted') {
      const facing = (committed[1 - event.seat] ?? 0) > (committed[event.seat] ?? 0);
      committed[event.seat] = (committed[event.seat] ?? 0) + event.amount;
      const before = pot;
      pot += event.amount;
      if (event.seat !== seat) continue;
      const kind = event.action.kind;
      if (kind === 'raise' && before > 0) countSize(counts, postflop, event.amount / before);
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
  };
}
