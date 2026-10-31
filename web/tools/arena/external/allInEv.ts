import type { Card } from '../../../src/cards/index.ts';
import { parseCard } from '../../../src/cards/index.ts';
import type { EngineEvent } from '../../../src/engine/index.ts';
import { equityVsHand } from '../../../src/equity/index.ts';
import type { ExternalLine } from './log.ts';

export function exactEquity(hero: [string, string], villain: [string, string], board: string[]): number {
  const [h0, h1] = hero.map(parseCard) as [Card, Card];
  const [v0, v1] = villain.map(parseCard) as [Card, Card];
  return equityVsHand([h0, h1], [v0, v1], board.map(parseCard));
}

interface AllInSpot {
  board: string[];
  committed: [number, number];
}

function allInSpot(events: EngineEvent[], board: string[]): AllInSpot | null {
  const committed: [number, number] = [0, 0];
  let boardAtLastAction = 0;
  let allIn = false;
  let showdown = false;
  for (const event of events) {
    if (event.type === 'blindPosted') committed[event.seat] += event.amount;
    else if (event.type === 'betReturned') committed[event.seat] -= event.amount;
    else if (event.type === 'showdown') showdown = true;
    else if (event.type === 'streetDealt') continue;
    else if (event.type === 'acted') {
      committed[event.seat] += event.amount;
      allIn ||= event.allIn;
      boardAtLastAction = boardLength(events, event);
    }
  }
  if (!allIn || !showdown || boardAtLastAction === 5) return null;
  return { board: board.slice(0, boardAtLastAction), committed };
}

function boardLength(events: EngineEvent[], until: EngineEvent): number {
  let length = 0;
  for (const event of events) {
    if (event === until) return length;
    if (event.type === 'streetDealt') length = event.board.length;
  }
  return length;
}

export function allInEvNet(line: ExternalLine): number {
  const { winnings, opponentCards, holeCards, board } = line.external;
  if (winnings === null) throw new Error('An abandoned hand has no result');
  if (line.record === null || opponentCards === null) return winnings;
  const spot = allInSpot(line.record.events, board);
  if (spot === null) return winnings;
  const equity = exactEquity(holeCards, opponentCards, spot.board);
  return equity * (spot.committed[0] + spot.committed[1]) - spot.committed[0];
}
