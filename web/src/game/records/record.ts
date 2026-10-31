import type { BotStyle, Decision } from '../../brains/index.ts';
import type { EngineEvent, SeatIndex, TableMode } from '../../engine/index.ts';
import { SHIPPED_STRATEGIES } from '../../cfr/index.ts';
import type { BotRecord } from '../../cfr/index.ts';
import type { CoachDecision } from '../../coach/index.ts';
import { formatCard } from '../cards.ts';
import type { Opponent } from '../opponent.ts';

export interface RecordedDecision {
  eventIndex: number;
  solverChoice: string;
  evByAction: Record<string, number | null>;
  style?: BotStyle;
}

export type RecordedCoach = CoachDecision & { eventIndex: number };

export interface RecordMeta {
  sessionId: string;
  mode: TableMode;
  names: [string, string];
  humanSeat: SeatIndex | null;
  bot: BotRecord;
  playedAt: string;
}

export interface HandRecord {
  version: 1;
  id: string;
  sessionId: string;
  mode: TableMode;
  handNumber: number;
  playedAt: string;
  names: [string, string];
  humanSeat: SeatIndex | null;
  bot: BotRecord;
  holeCards: [[string, string], [string, string]];
  board: string[];
  events: EngineEvent[];
  decisions: RecordedDecision[];
  coach?: RecordedCoach[];
}

export const MATH_BOT: BotRecord = { id: 'math', version: '1' };

export function botRecord(opponent: Opponent): BotRecord {
  return opponent === 'math' ? MATH_BOT : SHIPPED_STRATEGIES[opponent].record;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

export function recordDecision(
  decision: Decision,
  eventIndex: number,
  style?: BotStyle,
): RecordedDecision {
  const { fold, passive, aggressive } = decision.evByAction;
  return {
    eventIndex,
    solverChoice: decision.solverChoice,
    evByAction: {
      fold: finiteOrNull(fold),
      passive: finiteOrNull(passive),
      aggressive: finiteOrNull(aggressive),
    },
    ...(style === undefined ? {} : { style }),
  };
}

export function handRecord(
  events: EngineEvent[],
  decisions: RecordedDecision[],
  meta: RecordMeta,
  coach: RecordedCoach[] = [],
): HandRecord {
  const holeCards: HandRecord['holeCards'] = [
    ['', ''],
    ['', ''],
  ];
  let handNumber = 0;
  let board: string[] = [];
  for (const event of events) {
    if (event.type === 'handStarted') {
      handNumber = event.handNumber;
    } else if (event.type === 'holeCards') {
      holeCards[event.seat] = [formatCard(event.cards[0]), formatCard(event.cards[1])];
    } else if (event.type === 'streetDealt') {
      board = event.board.map(formatCard);
    }
  }
  return {
    version: 1,
    id: `${meta.sessionId}-${handNumber}`,
    sessionId: meta.sessionId,
    mode: meta.mode,
    handNumber,
    playedAt: meta.playedAt,
    names: meta.names,
    humanSeat: meta.humanSeat,
    bot: meta.bot,
    holeCards,
    board,
    events,
    decisions,
    ...(coach.length > 0 ? { coach } : {}),
  };
}
