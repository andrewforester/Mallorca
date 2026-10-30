import { createClient } from '@supabase/supabase-js';
import { formatCard } from '../cards/index.ts';
import { SIGNALS, moodWords } from '../talk/index.ts';
import type { HandFacts, LineIntent, Mood, SessionSummary, Signal } from '../talk/index.ts';

export const TALK_TIMEOUT_MS = 5000;

const MAX_RECENT = 8;
const MAX_ACTIONS = 30;
const MAX_ACTION_LENGTH = 80;
const MAX_TEXT = 200;

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
}

interface Envelope {
  sessionId: string;
  locale: string;
}

interface HandPayload extends Envelope {
  facts: FactsPayload;
  intent: IntentPayload;
  mood: string[];
  recent: ChatTurn[];
}

export interface LinePayload extends HandPayload {
  kind: 'line';
}

export interface ReplyPayload extends HandPayload {
  kind: 'reply';
  text: string;
}

export interface SummaryPayload extends Envelope {
  kind: 'summary';
  summary: SessionSummary;
}

export interface HandInput {
  sessionId: string;
  locale: string;
  facts: HandFacts;
  intent: LineIntent;
  mood: Mood;
  recent: ChatTurn[];
}

export interface TalkReply {
  text: string;
  signals: Signal[];
}

export interface TalkClient {
  readonly enabled: boolean;
  line(request: LinePayload): Promise<string | null>;
  reply(request: ReplyPayload): Promise<TalkReply | null>;
  summary(request: SummaryPayload): Promise<void>;
}

export const silentTalkClient: TalkClient = {
  enabled: false,
  line: () => Promise.resolve(null),
  reply: () => Promise.resolve(null),
  summary: () => Promise.resolve(),
};

function toFacts(facts: HandFacts): FactsPayload {
  return {
    street: facts.street,
    board: facts.board.map(formatCard),
    pot: facts.pot,
    stacks: [facts.stacks[0], facts.stacks[1]],
    her: facts.her === null ? null : [formatCard(facts.her[0]), formatCard(facts.her[1])],
    actions: facts.actions.slice(-MAX_ACTIONS).map((action) => action.slice(0, MAX_ACTION_LENGTH)),
    bigBlind: facts.bigBlind,
  };
}

function toHand(input: HandInput): HandPayload {
  const recent = input.recent.filter((turn) => turn.text.trim() !== '').slice(-MAX_RECENT);
  return {
    sessionId: input.sessionId,
    locale: input.locale,
    facts: toFacts(input.facts),
    intent: {
      situation: input.intent.situation,
      hint: input.intent.hint,
      honest: input.intent.honest,
    },
    mood: moodWords(input.mood),
    recent: recent.map((turn) => ({ speaker: turn.speaker, text: turn.text })),
  };
}

export function toLinePayload(input: HandInput): LinePayload {
  return { kind: 'line', ...toHand(input) };
}

export function toReplyPayload(input: HandInput & { text: string }): ReplyPayload {
  return { kind: 'reply', ...toHand(input), text: input.text.trim().slice(0, MAX_TEXT) };
}

export function toSummaryPayload(input: {
  sessionId: string;
  locale: string;
  summary: SessionSummary;
}): SummaryPayload {
  return {
    kind: 'summary',
    sessionId: input.sessionId,
    locale: input.locale,
    summary: input.summary,
  };
}

export interface RemoteOptions {
  url: string;
  anonKey: string;
  fetch?: typeof fetch;
}

type Tokens = () => Promise<string | null>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSignals(value: unknown): Signal[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Signal => (SIGNALS as readonly unknown[]).includes(item));
}

function parseReply(body: unknown): TalkReply | null {
  if (!isRecord(body) || typeof body.text !== 'string' || body.text.trim() === '') return null;
  return { text: body.text, signals: parseSignals(body.signals) };
}

async function post(options: RemoteOptions, tokens: Tokens, payload: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TALK_TIMEOUT_MS);
  try {
    const token = await tokens();
    if (token === null) return null;
    const send = options.fetch ?? fetch;
    const response = await send(`${options.url}/functions/v1/talk`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        apikey: options.anonKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return response.ok ? ((await response.json()) as unknown) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function connected(options: RemoteOptions, tokens: Tokens): TalkClient {
  return {
    enabled: true,
    line: async (request) => parseReply(await post(options, tokens, request))?.text ?? null,
    reply: async (request) => parseReply(await post(options, tokens, request)),
    summary: async (request) => {
      await post(options, tokens, request);
    },
  };
}

async function signIn(options: RemoteOptions): Promise<Tokens | null> {
  const client = createClient(options.url, options.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
    global: options.fetch === undefined ? {} : { fetch: options.fetch },
  });
  const existing = await client.auth.getSession();
  if (existing.data.session === null) {
    const created = await client.auth.signInAnonymously();
    if (created.error !== null || created.data.session === null) return null;
  }
  return async () => (await client.auth.getSession()).data.session?.access_token ?? null;
}

export async function remoteTalkClient(options: RemoteOptions): Promise<TalkClient> {
  try {
    const tokens = await signIn(options);
    return tokens === null ? silentTalkClient : connected(options, tokens);
  } catch {
    return silentTalkClient;
  }
}
