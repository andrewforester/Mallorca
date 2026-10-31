export const SIGNALS = [
  "tease",
  "compliment",
  "claimStrength",
  "claimWeakness",
  "mockBluff",
  "friendly",
] as const;
export type Signal = typeof SIGNALS[number];

export const STREETS = ["preflop", "flop", "turn", "river", "showdown", "complete"] as const;
export type Street = typeof STREETS[number];

export const SITUATIONS = [
  "herBet",
  "herCall",
  "playerBet",
  "handWon",
  "handLost",
  "bluffCaught",
] as const;
export type Situation = typeof SITUATIONS[number];

export const HINTS = ["strong", "medium", "weak"] as const;
export type Hint = typeof HINTS[number];

export type Speaker = "mallorca" | "player";

export interface Facts {
  street: Street;
  board: string[];
  pot: number;
  stacks: [number, number];
  her: [string, string] | null;
  actions: string[];
  bigBlind: number;
}

export interface Intent {
  situation: Situation;
  hint: Hint | null;
  honest: boolean;
  street: Street;
}

export interface RecentLine {
  speaker: Speaker;
  text: string;
}

export interface SessionSummary {
  hands: number;
  netBb: number;
  playerBluffsShown: number;
  playerAllIns: number;
  signals: Partial<Record<Signal, number>>;
}

interface Envelope {
  sessionId: string;
  locale: string;
}

interface HandContext extends Envelope {
  facts: Facts;
  intent: Intent;
  mood: string[];
  recent: RecentLine[];
}

export interface LineRequest extends HandContext {
  kind: "line";
}

export interface ReplyRequest extends HandContext {
  kind: "reply";
  text: string;
  quick: boolean;
}

export interface SummaryRequest extends Envelope {
  kind: "summary";
  summary: SessionSummary;
}

export type TalkRequest = LineRequest | ReplyRequest | SummaryRequest;

export const LIMITS = {
  sessionId: 64,
  localeMin: 2,
  localeMax: 10,
  board: 5,
  actions: 30,
  action: 80,
  mood: 3,
  moodWord: 40,
  recent: 8,
  recentText: 400,
  text: 200,
} as const;

const CARD = /^[2-9TJQKA][cdhs]$/;
const LOCALE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/;

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isText = (value: unknown, min: number, max: number): value is string =>
  typeof value === "string" && value.length >= min && value.length <= max;

const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isCount = (value: unknown): value is number => Number.isInteger(value) && isAmount(value);

const isCard = (value: unknown): value is string => typeof value === "string" && CARD.test(value);

const isOneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (options as readonly string[]).includes(value);

const isList = <T>(value: unknown, max: number, item: (v: unknown) => v is T): value is T[] =>
  Array.isArray(value) && value.length <= max && value.every(item);

const isAction = (value: unknown): value is string => isText(value, 1, LIMITS.action);
const isMoodWord = (value: unknown): value is string => isText(value, 1, LIMITS.moodWord);

function parseFacts(value: unknown): Facts | null {
  if (!isRecord(value)) return null;
  const { street, board, pot, stacks, her, actions, bigBlind } = value;
  if (!isOneOf(STREETS, street) || !isList(board, LIMITS.board, isCard) || !isAmount(pot)) {
    return null;
  }
  if (!Array.isArray(stacks) || stacks.length !== 2 || !stacks.every(isAmount)) return null;
  const hole = her === null || (Array.isArray(her) && her.length === 2 && her.every(isCard));
  if (!hole || !isList(actions, LIMITS.actions, isAction)) return null;
  if (!isAmount(bigBlind) || bigBlind === 0) return null;
  return {
    street,
    board: [...board],
    pot,
    stacks: [stacks[0], stacks[1]],
    her: her === null ? null : [her[0], her[1]],
    actions: [...actions],
    bigBlind,
  };
}

function parseIntent(value: unknown): Intent | null {
  if (!isRecord(value)) return null;
  const { situation, hint, honest, street } = value;
  if (!isOneOf(SITUATIONS, situation) || typeof honest !== "boolean") return null;
  if (hint !== null && !isOneOf(HINTS, hint)) return null;
  if (!isOneOf(STREETS, street)) return null;
  return { situation, hint, honest, street };
}

function parseRecentLine(value: unknown): RecentLine | null {
  if (!isRecord(value)) return null;
  const { speaker, text } = value;
  if (speaker !== "mallorca" && speaker !== "player") return null;
  if (!isText(text, 1, LIMITS.recentText) || text.trim().length === 0) return null;
  return { speaker, text };
}

function parseRecent(value: unknown): RecentLine[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.recent) return null;
  const lines = value.map(parseRecentLine);
  return lines.every((line) => line !== null) ? lines as RecentLine[] : null;
}

function parseSignalCounts(value: unknown): Partial<Record<Signal, number>> | null {
  if (!isRecord(value)) return null;
  const counts: Partial<Record<Signal, number>> = {};
  for (const [key, count] of Object.entries(value)) {
    if (!isOneOf(SIGNALS, key) || !isCount(count)) return null;
    counts[key] = count;
  }
  return counts;
}

function parseSummary(value: unknown): SessionSummary | null {
  if (!isRecord(value)) return null;
  const { hands, netBb, playerBluffsShown, playerAllIns } = value;
  if (!isCount(hands) || !isCount(playerBluffsShown) || !isCount(playerAllIns)) return null;
  if (typeof netBb !== "number" || !Number.isFinite(netBb)) return null;
  const signals = parseSignalCounts(value.signals);
  if (signals === null) return null;
  return { hands, netBb, playerBluffsShown, playerAllIns, signals };
}

function parseEnvelope(body: Json): Envelope | null {
  const { sessionId, locale } = body;
  if (!isText(sessionId, 1, LIMITS.sessionId)) return null;
  if (!isText(locale, LIMITS.localeMin, LIMITS.localeMax) || !LOCALE.test(locale)) return null;
  return { sessionId, locale };
}

function parseHandContext(body: Json, envelope: Envelope): HandContext | null {
  const facts = parseFacts(body.facts);
  const intent = parseIntent(body.intent);
  const recent = parseRecent(body.recent);
  if (facts === null || intent === null || recent === null) return null;
  if (!isList(body.mood, LIMITS.mood, isMoodWord)) return null;
  return { ...envelope, facts, intent, mood: [...body.mood], recent };
}

function parseText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= 1 && text.length <= LIMITS.text ? text : null;
}

export function parseRequest(body: unknown): TalkRequest | null {
  if (!isRecord(body)) return null;
  const envelope = parseEnvelope(body);
  if (envelope === null) return null;
  if (body.kind === "summary") {
    const summary = parseSummary(body.summary);
    return summary === null ? null : { kind: "summary", ...envelope, summary };
  }
  if (body.kind !== "line" && body.kind !== "reply") return null;
  const context = parseHandContext(body, envelope);
  if (context === null) return null;
  if (body.kind === "line") return { kind: "line", ...context };
  const text = parseText(body.text);
  const quick = body.quick ?? false;
  if (text === null || typeof quick !== "boolean") return null;
  return { kind: "reply", ...context, text, quick };
}
