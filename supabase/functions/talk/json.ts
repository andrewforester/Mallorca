export const STREETS = ["preflop", "flop", "turn", "river", "showdown", "complete"] as const;
export type Street = typeof STREETS[number];

export type Speaker = "mallorca" | "player";

export interface RecentLine {
  speaker: Speaker;
  text: string;
}

export interface Envelope {
  sessionId: string;
  locale: string;
}

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

export const CARD = /^[2-9TJQKA][cdhs]$/;
export const LOCALE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/;

export type Json = Record<string, unknown>;

export const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isText = (value: unknown, min: number, max: number): value is string =>
  typeof value === "string" && value.length >= min && value.length <= max;

export const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export const isCount = (value: unknown): value is number =>
  Number.isInteger(value) && isAmount(value);

export const isCard = (value: unknown): value is string =>
  typeof value === "string" && CARD.test(value);

export const isOneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (options as readonly string[]).includes(value);

export const isList = <T>(
  value: unknown,
  max: number,
  item: (v: unknown) => v is T,
): value is T[] => Array.isArray(value) && value.length <= max && value.every(item);

export function parseRecentLine(value: unknown): RecentLine | null {
  if (!isRecord(value)) return null;
  const { speaker, text } = value;
  if (speaker !== "mallorca" && speaker !== "player") return null;
  if (!isText(text, 1, LIMITS.recentText) || text.trim().length === 0) return null;
  return { speaker, text };
}

export function parseRecent(value: unknown): RecentLine[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.recent) return null;
  const lines = value.map(parseRecentLine);
  return lines.every((line) => line !== null) ? lines as RecentLine[] : null;
}

export function parseEnvelope(body: Json): Envelope | null {
  const { sessionId, locale } = body;
  if (!isText(sessionId, 1, LIMITS.sessionId)) return null;
  if (!isText(locale, LIMITS.localeMin, LIMITS.localeMax) || !LOCALE.test(locale)) return null;
  return { sessionId, locale };
}

export function parseText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= 1 && text.length <= LIMITS.text ? text : null;
}
