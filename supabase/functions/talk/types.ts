import {
  isAmount,
  isCard,
  isCount,
  isList,
  isOneOf,
  isRecord,
  isText,
  LIMITS,
  parseEnvelope,
  parseRecent,
  parseText,
  STREETS,
} from "./json.ts";
import type { Envelope, Json, RecentLine, Street } from "./json.ts";
import { parsePlanRequest } from "./planTypes.ts";
import type { LineRequestV2, ReplyRequestV2 } from "./planTypes.ts";

export { LIMITS, STREETS } from "./json.ts";
export type { RecentLine, Speaker, Street } from "./json.ts";
import { parseCharacter, parseFeeling, UNKNOWN } from "./feeling.ts";
import type { Character, Feeling } from "./feeling.ts";

export const SIGNALS = [
  "tease",
  "compliment",
  "claimStrength",
  "claimWeakness",
  "mockBluff",
  "friendly",
] as const;
export type Signal = typeof SIGNALS[number];

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

export interface SessionSummary {
  hands: number;
  netBb: number;
  playerBluffsShown: number;
  playerAllIns: number;
  signals: Partial<Record<Signal, number>>;
}

interface HandContext extends Envelope {
  facts: Facts;
  intent: Intent;
  mood: string[];
  feeling: Feeling | null;
  character: Character | null;
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

export type TalkRequest =
  | LineRequest
  | ReplyRequest
  | SummaryRequest
  | LineRequestV2
  | ReplyRequestV2;

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

function parseHandContext(body: Json, envelope: Envelope): HandContext | null {
  const facts = parseFacts(body.facts);
  const intent = parseIntent(body.intent);
  const recent = parseRecent(body.recent);
  if (facts === null || intent === null || recent === null) return null;
  if (!isList(body.mood, LIMITS.mood, isMoodWord)) return null;
  const feeling = parseFeeling(body.feeling);
  const character = parseCharacter(body.character);
  if (feeling === null || character === null) return null;
  return {
    ...envelope,
    facts,
    intent,
    mood: [...body.mood],
    feeling: feeling === UNKNOWN ? null : feeling,
    character: character === UNKNOWN ? null : character,
    recent,
  };
}

export function parseRequest(body: unknown): TalkRequest | null {
  if (!isRecord(body)) return null;
  if (body.version === 2) return parsePlanRequest(body);
  if (body.version !== undefined) return null;
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
