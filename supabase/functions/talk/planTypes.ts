import { EMOTIONS } from "./feeling.ts";
import type { Emotion } from "./feeling.ts";
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

export const ACTS = [
  "react",
  "claim",
  "press",
  "stall",
  "deflect",
  "concede",
  "complain",
  "enjoy",
  "tease",
  "answer",
] as const;
export type Act = typeof ACTS[number];

export const HUMOUR_STYLES = [
  "affiliative",
  "selfEnhancing",
  "aggressive",
  "selfDefeating",
] as const;
export type HumourStyle = typeof HUMOUR_STYLES[number];

const TARGETS = ["self", "play", "situation"] as const;
const INTENSITIES = ["soft", "clear", "sharp"] as const;
const CLASSES = ["strong", "medium", "weak"] as const;
const NOTABLE_KINDS = ["bigWin", "bigLoss", "bluffCaught", "fought"] as const;
const VOICES = [...EMOTIONS, "calm"] as const;
const TRAITS = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "neuroticism",
] as const;

export const PLAN_LIMITS = { words: 20, occasion: 200, heard: 200, notable: 4 } as const;

export type BigFive = Record<typeof TRAITS[number], number>;

export interface Humour {
  style: HumourStyle;
  target: typeof TARGETS[number];
  intensity: typeof INTENSITIES[number];
  softened: boolean;
}

export interface PlanFacts {
  street: Street;
  board: string[];
  potBb: number;
  stacksBb: { her: number; player: number };
  actions: string[];
  card: string | null;
  result: { won: boolean; potBb: number } | null;
  shown: { her: [string, string]; player: [string, string] } | null;
}

export interface Notable {
  kind: typeof NOTABLE_KINDS[number];
  handNumber: number;
  potBb: number;
  won: boolean;
  bets: number;
}

export interface PlanBody {
  version: 2;
  act: Act;
  occasion: string;
  voice: { emotion: Emotion | "calm"; intensity: number };
  words: { min: number; max: number };
  humour: Humour | null;
  claim: { about: typeof CLASSES[number]; honest: boolean } | null;
  facts: PlanFacts;
  heard: string | null;
  session: {
    hands: number;
    netBb: number;
    playerBluffsShown: number;
    playerAllIns: number;
    notable: Notable[];
  };
  handNumber: number;
  street: Street;
  actionStreet: Street;
  endsHand: boolean;
}

interface PlanContext extends Envelope {
  version: 2;
  personality: BigFive;
  plan: PlanBody;
  recent: RecentLine[];
  debug: boolean;
}

export interface LineRequestV2 extends PlanContext {
  kind: "line";
}

export interface ReplyRequestV2 extends PlanContext {
  kind: "reply";
  text: string;
  quick: boolean;
}

const isUnit = (v: unknown): v is number => isAmount(v) && v <= 1;
const isTrait = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= -1 && v <= 1;
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isAction = (v: unknown): v is string => isText(v, 1, LIMITS.action);
const isPair = (v: unknown): v is [string, string] =>
  Array.isArray(v) && v.length === 2 && v.every(isCard);
const nullOr = <T>(v: unknown, is: (x: unknown) => x is T): v is T | null => v === null || is(v);

function isBigFive(v: unknown): v is BigFive {
  return isRecord(v) && TRAITS.every((t) => isTrait(v[t])) &&
    Object.keys(v).length === TRAITS.length;
}

function isHumour(v: unknown): v is Humour {
  return isRecord(v) && isOneOf(HUMOUR_STYLES, v.style) && isOneOf(TARGETS, v.target) &&
    isOneOf(INTENSITIES, v.intensity) && isBool(v.softened);
}

function isClaim(v: unknown): v is PlanBody["claim"] {
  return isRecord(v) && isOneOf(CLASSES, v.about) && isBool(v.honest);
}

function isWords(v: unknown): v is PlanBody["words"] {
  if (!isRecord(v) || !isCount(v.min) || !isCount(v.max)) return false;
  return v.min >= 1 && v.min <= v.max && v.max <= PLAN_LIMITS.words;
}

function isVoice(v: unknown): v is PlanBody["voice"] {
  return isRecord(v) && isOneOf(VOICES, v.emotion) && isUnit(v.intensity);
}

function isResult(v: unknown): v is PlanFacts["result"] {
  return isRecord(v) && isBool(v.won) && isAmount(v.potBb);
}

function isShown(v: unknown): v is PlanFacts["shown"] {
  return isRecord(v) && isPair(v.her) && isPair(v.player);
}

function isFacts(v: unknown): v is PlanFacts {
  if (!isRecord(v) || !isOneOf(STREETS, v.street)) return false;
  if (!isList(v.board, LIMITS.board, isCard) || !isAmount(v.potBb)) return false;
  const stacks = v.stacksBb;
  if (!isRecord(stacks) || !isAmount(stacks.her) || !isAmount(stacks.player)) return false;
  if (!isList(v.actions, LIMITS.actions, isAction) || !nullOr(v.card, isCard)) return false;
  return nullOr(v.result, isResult) && nullOr(v.shown, isShown);
}

function isNotable(v: unknown): v is Notable {
  return isRecord(v) && isOneOf(NOTABLE_KINDS, v.kind) && isCount(v.handNumber) &&
    isAmount(v.potBb) && isBool(v.won) && isCount(v.bets);
}

function isSession(v: unknown): v is PlanBody["session"] {
  if (!isRecord(v) || !isCount(v.hands) || !isNumber(v.netBb)) return false;
  if (!isCount(v.playerBluffsShown) || !isCount(v.playerAllIns)) return false;
  return isList(v.notable, PLAN_LIMITS.notable, isNotable);
}

const isOccasion = (v: unknown): v is string => isText(v, 1, PLAN_LIMITS.occasion);
const isHeard = (v: unknown): v is string => isText(v, 1, PLAN_LIMITS.heard);

function isPlanHead(v: Json): boolean {
  return v.version === 2 && isOneOf(ACTS, v.act) && isOccasion(v.occasion) && isVoice(v.voice) &&
    isWords(v.words) && nullOr(v.humour, isHumour) && nullOr(v.claim, isClaim);
}

function isPlan(v: unknown): v is PlanBody {
  if (!isRecord(v) || !isPlanHead(v)) return false;
  if (!isFacts(v.facts) || !nullOr(v.heard, isHeard) || !isSession(v.session)) return false;
  return isCount(v.handNumber) && isOneOf(STREETS, v.street) &&
    isOneOf(STREETS, v.actionStreet) && isBool(v.endsHand);
}

function parseContext(body: Json): PlanContext | null {
  const envelope = parseEnvelope(body);
  const recent = parseRecent(body.recent);
  if (envelope === null || recent === null) return null;
  if (!isBigFive(body.personality) || !isPlan(body.plan) || !isBool(body.debug)) return null;
  return {
    ...envelope,
    version: 2,
    personality: body.personality,
    plan: body.plan,
    recent,
    debug: body.debug,
  };
}

export function parsePlanRequest(body: unknown): LineRequestV2 | ReplyRequestV2 | null {
  if (!isRecord(body) || (body.kind !== "line" && body.kind !== "reply")) return null;
  const context = parseContext(body);
  if (context === null) return null;
  if (body.kind === "line") return { kind: "line", ...context };
  const text = parseText(body.text);
  const quick = body.quick ?? false;
  if (text === null || !isBool(quick)) return null;
  return { kind: "reply", ...context, text, quick };
}

export const isPlanRequest = (req: { kind: string }): req is LineRequestV2 | ReplyRequestV2 =>
  "version" in req && req.version === 2;
