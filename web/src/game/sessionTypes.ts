import type { StoreApi } from 'zustand/vanilla';
import type { Decision } from '../brains/index.ts';
import type { LogEntry, SeatIndex, Table, TableMode } from '../engine/index.ts';
import type { Level } from '../conversation/index.ts';
import type { Personality, PersonalityKey } from '../persona/index.ts';
import type { BotClient } from './botClient.ts';
import type { CoachState } from './coach.ts';
import type { DebugState } from './debug.ts';
import type { Intent } from './intent.ts';
import type { Opponent } from './opponent.ts';
import type { HandResult, SeatActions } from './outcome.ts';
import type { RecordsOptions } from './records/recorder.ts';
import type { FaceFrame } from '../face/index.ts';
import type { FaceState } from './sessionFace.ts';
import type { QuickPhrase, ConversationState } from './sessionConversation.ts';
import type { ConversationClient } from './conversationClient.ts';

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
  conversation: ConversationState;
  coach: CoachState;
  face: FaceState;
  debug: DebugState | null;
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
  setConversation(on: boolean): void;
  setTells(level: Level): void;
  attachConversation(client: ConversationClient): void;
  pageHidden(): void;
  setFace(on: boolean): void;
  faceNow(): FaceFrame | null;
  setPersonality(choice: PersonalityKey | Personality): void;
  resetFeeling(): void;
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
  conversation?: ConversationClient;
  connectConversation?: () => Promise<ConversationClient>;
  now?: () => number;
  locale?: string;
  conversationOn?: boolean;
  tells?: Level;
  coach?: boolean;
  faceOn?: boolean;
  debug?: boolean;
}
