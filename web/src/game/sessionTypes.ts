import type { StoreApi } from 'zustand/vanilla';
import type { Decision } from '../brains/index.ts';
import type { LogEntry, SeatIndex, Table, TableMode } from '../engine/index.ts';
import type { Level } from '../talk/index.ts';
import type { BotClient } from './botClient.ts';
import type { CoachState } from './coach.ts';
import type { Intent } from './intent.ts';
import type { Opponent } from './opponent.ts';
import type { HandResult, SeatActions } from './outcome.ts';
import type { RecordsOptions } from './records/recorder.ts';
import type { QuickPhrase, TalkState } from './sessionTalk.ts';
import type { TalkClient } from './talkClient.ts';

export type Phase =
  | 'idle'
  | 'humanToAct'
  | 'botThinking'
  | 'animating'
  | 'handOver'
  | 'tournamentOver'
  | 'sessionOver';

export interface SessionResult {
  hands: number;
  net: number;
}

export interface SessionState {
  table: Table;
  phase: Phase;
  log: LogEntry[];
  lastActions: SeatActions;
  closingActions: SeatActions;
  lastDecision: Decision | null;
  seed: number;
  result: HandResult | null;
  session: SessionResult;
  sessionId: string | null;
  opponent: Opponent;
  talk: TalkState;
  coach: CoachState;
}

export interface SessionActions {
  start(mode?: TableMode, opponent?: Opponent): Promise<void>;
  leave(): void;
  nextHand(): Promise<void>;
  act(intent: Intent): Promise<void>;
  setCoach(on: boolean): void;
  dispose(): void;
  say(text: string): void;
  quick(id: QuickPhrase, text: string): void;
  setTalk(on: boolean): void;
  setTells(level: Level): void;
  attachTalk(client: TalkClient): void;
  pageHidden(): void;
}

export type Session = StoreApi<SessionState & SessionActions>;

export interface SessionOptions {
  bot: BotClient;
  seed: number;
  botDelayMs: number;
  humanSeat: SeatIndex;
  names: [string, string];
  startingStacks?: [number, number];
  mode: TableMode;
  records?: RecordsOptions;
  talk?: TalkClient;
  connectTalk?: () => Promise<TalkClient>;
  now?: () => number;
  locale?: string;
  talkOn?: boolean;
  tells?: Level;
  coach?: boolean;
}
