import { formatCard } from '../cards/index.ts';
import type { SeatIndex } from '../engine/index.ts';
import type {
  Character,
  FeelingState,
  HandFacts,
  LineIntent,
  SessionSummary,
  Signal,
} from '../conversation/index.ts';

export const CONVERSATION_TIMEOUT_MS = 5000;

const MAX_RECENT = 8;
const MAX_ACTIONS = 30;
const MAX_ACTION_LENGTH = 80;
const MAX_TEXT = 200;
const MAX_RECENT_TEXT = 400;
const MAX_SESSION_ID = 64;
const LOCALE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/;
const DEFAULT_LOCALE = 'en';

export interface ChatTurn {
  speaker: 'mallorca' | 'player';
  text: string;
}

export interface FactsPayload {
  street: string;
  board: string[];
  pot: number;
  stacks: [number, number];
  her: [string, string] | null;
  actions: string[];
  bigBlind: number;
}

export interface IntentPayload {
  situation: string;
  hint: string | null;
  honest: boolean;
  street: string;
}

interface Envelope {
  sessionId: string;
  locale: string;
}

interface HandPayload extends Envelope {
  facts: FactsPayload;
  intent: IntentPayload;
  mood: string[];
  feeling: FeelingState;
  character: Character;
  recent: ChatTurn[];
}

export interface LinePayload extends HandPayload {
  kind: 'line';
}

export interface ReplyPayload extends HandPayload {
  kind: 'reply';
  text: string;
  quick: boolean;
}

export interface SummaryPayload extends Envelope {
  kind: 'summary';
  summary: SessionSummary;
}

export interface HandInput {
  sessionId: string;
  locale: string;
  seat: SeatIndex;
  facts: HandFacts;
  intent: LineIntent;
  mood: string[];
  feeling: FeelingState;
  character: Character;
  recent: ChatTurn[];
}

export interface ConversationReply {
  text: string;
  signals: Signal[];
}

export interface SendOptions {
  keepalive?: boolean;
}

export interface ConversationClient {
  readonly enabled: boolean;
  line(request: LinePayload): Promise<string | null>;
  reply(request: ReplyPayload): Promise<ConversationReply | null>;
  summary(request: SummaryPayload, options?: SendOptions): Promise<void>;
}

export const silentConversationClient: ConversationClient = {
  enabled: false,
  line: () => Promise.resolve(null),
  reply: () => Promise.resolve(null),
  summary: () => Promise.resolve(),
};

function toFacts(facts: HandFacts, seat: SeatIndex): FactsPayload {
  return {
    street: facts.street,
    board: facts.board.map(formatCard),
    pot: facts.pot,
    stacks: [facts.stacks[seat], facts.stacks[seat === 0 ? 1 : 0]],
    her: facts.her === null ? null : [formatCard(facts.her[0]), formatCard(facts.her[1])],
    actions: facts.actions.slice(-MAX_ACTIONS).map((action) => action.slice(0, MAX_ACTION_LENGTH)),
    bigBlind: facts.bigBlind,
  };
}

function toSessionId(value: string): string {
  return value.slice(0, MAX_SESSION_ID);
}

function toLocale(value: string): string {
  const dashed = value.replace('_', '-');
  return LOCALE.test(dashed) && dashed.length <= 10 ? dashed : DEFAULT_LOCALE;
}

function toHand(input: HandInput): HandPayload {
  const recent = input.recent.filter((turn) => turn.text.trim() !== '').slice(-MAX_RECENT);
  return {
    sessionId: toSessionId(input.sessionId),
    locale: toLocale(input.locale),
    facts: toFacts(input.facts, input.seat),
    intent: {
      situation: input.intent.situation,
      hint: input.intent.hint,
      honest: input.intent.honest,
      street: input.intent.actionStreet,
    },
    mood: [...input.mood],
    feeling: input.feeling,
    character: input.character,
    recent: recent.map((turn) => ({
      speaker: turn.speaker,
      text: turn.text.slice(0, MAX_RECENT_TEXT),
    })),
  };
}

export function toLinePayload(input: HandInput): LinePayload {
  return { kind: 'line', ...toHand(input) };
}

export function toReplyPayload(input: HandInput & { text: string; quick?: boolean }): ReplyPayload {
  return {
    kind: 'reply',
    ...toHand(input),
    text: input.text.trim().slice(0, MAX_TEXT),
    quick: input.quick ?? false,
  };
}

export function toSummaryPayload(input: {
  sessionId: string;
  locale: string;
  summary: SessionSummary;
}): SummaryPayload {
  return {
    kind: 'summary',
    sessionId: toSessionId(input.sessionId),
    locale: toLocale(input.locale),
    summary: { ...input.summary, netBb: 0 - input.summary.netBb },
  };
}
