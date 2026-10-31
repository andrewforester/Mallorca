import type { EngineEvent } from '../../../src/engine/index.ts';
import type { HandRecord } from '../../../src/game/records/record.ts';

export type Position = 'button' | 'bigBlind';
export type EndStreet = 'preflop' | 'flop' | 'turn' | 'river';

export const STREETS: EndStreet[] = ['preflop', 'flop', 'turn', 'river'];

export interface HandSummary {
  line: number;
  handNumber: number;
  pair: number;
  aSeat: 0 | 1;
  position: Position;
  aNet: number;
  street: EndStreet;
  showdown: boolean;
  pot: number;
}

export interface Slice {
  key: string;
  hands: number;
  bb: number;
  bbPer100: number;
}

export interface Slices {
  position: Slice[];
  street: Slice[];
  showdown: Slice[];
}

export interface HandFilter {
  position?: Position;
  street?: EndStreet;
  showdown?: boolean;
}

export interface PairRow {
  pair: number;
  net: number;
  pot: number;
  hands: [HandSummary, HandSummary];
  matches: [boolean, boolean];
}

function lastActionStreet(events: EngineEvent[]): EndStreet {
  let current: EndStreet = 'preflop';
  let acted: EndStreet = 'preflop';
  for (const event of events) {
    if (event.type === 'streetDealt') current = event.street;
    else if (event.type === 'acted') acted = current;
  }
  return acted;
}

function stacks(events: EngineEvent[]): { start: number[]; end: number[] } {
  let start = [0, 0];
  let end = [0, 0];
  for (const event of events) {
    if (event.type === 'handStarted') start = event.stacks;
    else if (event.type === 'handEnded') end = event.stacks;
  }
  return { start, end };
}

export function summarize(record: HandRecord, line: number): HandSummary {
  const k = (record.handNumber - 1) % 2;
  const aSeat = k === 0 ? 0 : 1;
  const button = record.events.find((e) => e.type === 'handStarted')?.button ?? 0;
  const { start, end } = stacks(record.events);
  return {
    line,
    handNumber: record.handNumber,
    pair: Math.floor((record.handNumber - 1) / 2),
    aSeat,
    position: aSeat === button ? 'button' : 'bigBlind',
    aNet: (end[aSeat] ?? 0) - (start[aSeat] ?? 0),
    street: lastActionStreet(record.events),
    showdown: record.events.some((e) => e.type === 'showdown'),
    pot: record.events.reduce((sum, e) => (e.type === 'potAwarded' ? sum + e.amount : sum), 0),
  };
}

export function pairNets(hands: HandSummary[]): number[] {
  const nets: number[] = [];
  for (const hand of hands) nets[hand.pair] = (nets[hand.pair] ?? 0) + hand.aNet;
  return Array.from(nets, (net) => net ?? 0);
}

export function cumulative(
  nets: number[],
  bigBlind: number,
  maxPoints = 600,
): { pair: number; bb: number }[] {
  const step = Math.max(1, Math.ceil(nets.length / maxPoints));
  const points: { pair: number; bb: number }[] = [];
  let total = 0;
  nets.forEach((net, i) => {
    total += net;
    if ((i + 1) % step === 0 || i === nets.length - 1)
      points.push({ pair: i + 1, bb: total / bigBlind });
  });
  return points;
}

function slice(key: string, hands: HandSummary[], bigBlind: number): Slice {
  const bb = hands.reduce((sum, h) => sum + h.aNet, 0) / bigBlind;
  return {
    key,
    hands: hands.length,
    bb,
    bbPer100: hands.length === 0 ? 0 : (bb / hands.length) * 100,
  };
}

export function slices(hands: HandSummary[], bigBlind: number): Slices {
  const by = (key: string, test: (h: HandSummary) => boolean) =>
    slice(key, hands.filter(test), bigBlind);
  return {
    position: [
      by('button', (h) => h.position === 'button'),
      by('bigBlind', (h) => h.position === 'bigBlind'),
    ],
    street: STREETS.map((street) => by(street, (h) => h.street === street)),
    showdown: [by('showdown', (h) => h.showdown), by('no-showdown', (h) => !h.showdown)],
  };
}

function passes(hand: HandSummary, filter: HandFilter): boolean {
  return (
    (filter.position === undefined || hand.position === filter.position) &&
    (filter.street === undefined || hand.street === filter.street) &&
    (filter.showdown === undefined || hand.showdown === filter.showdown)
  );
}

function sortKey(row: PairRow, sort: 'net' | 'pot', filtered: boolean): number {
  if (!filtered) return sort === 'net' ? Math.abs(row.net) : row.pot;
  const matching = row.hands.filter((_, i) => row.matches[i]);
  return Math.max(...matching.map((h) => (sort === 'net' ? Math.abs(h.aNet) : h.pot)));
}

export function pairRows(hands: HandSummary[], filter: HandFilter, sort: 'net' | 'pot'): PairRow[] {
  const byPair = new Map<number, HandSummary[]>();
  for (const hand of hands) byPair.set(hand.pair, [...(byPair.get(hand.pair) ?? []), hand]);
  const rows: PairRow[] = [];
  for (const [pair, list] of byPair) {
    const [first, second] = [...list].sort((x, y) => x.handNumber - y.handNumber);
    if (first === undefined || second === undefined) continue;
    const matches: [boolean, boolean] = [passes(first, filter), passes(second, filter)];
    if (!matches[0] && !matches[1]) continue;
    rows.push({
      pair,
      net: first.aNet + second.aNet,
      pot: Math.max(first.pot, second.pot),
      hands: [first, second],
      matches,
    });
  }
  const filtered = Object.values(filter).some((v) => v !== undefined);
  return rows.sort(
    (x, y) => sortKey(y, sort, filtered) - sortKey(x, sort, filtered) || x.pair - y.pair,
  );
}
