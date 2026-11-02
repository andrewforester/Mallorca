import { AMBIGUOUS_TOKENS, CARD_TOKEN, claimsHolding, normalize, POCKET } from "./filter.ts";
import type { RecentLine } from "./json.ts";
import type { PlanBody } from "./planTypes.ts";

const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";
const WORD = /[\p{L}\p{N}]+/gu;

const EN_RANKS: readonly [string, string][] = [
  ["ace", "A"],
  ["king", "K"],
  ["queen", "Q"],
  ["jack", "J"],
  ["ten", "T"],
  ["nine", "9"],
  ["eight", "8"],
  ["seven", "7"],
  ["six", "6"],
  ["five", "5"],
  ["four", "4"],
  ["three", "3"],
  ["two", "2"],
  ["deuce", "2"],
];

const RU_RANKS: readonly [string, string][] = [
  ["туз", "A"],
  ["корол", "K"],
  ["дам", "Q"],
  ["валет", "J"],
  ["вальт", "J"],
  ["десятк", "T"],
  ["девятк", "9"],
  ["восьм", "8"],
  ["сем", "7"],
  ["шест", "6"],
  ["пят", "5"],
  ["четв", "4"],
  ["трой", "3"],
  ["двой", "2"],
];

const SUITS: readonly [string, string][] = [
  ["spade", "s"],
  ["heart", "h"],
  ["diamond", "d"],
  ["club", "c"],
  ["пик", "s"],
  ["черв", "h"],
  ["бубн", "d"],
  ["бубен", "d"],
  ["треф", "c"],
  ["крест", "c"],
  ["♠", "s"],
  ["♤", "s"],
  ["♥", "h"],
  ["♡", "h"],
  ["♦", "d"],
  ["♢", "d"],
  ["♣", "c"],
  ["♧", "c"],
];

const EN_RANK = EN_RANKS.map(([w]) => w).join("|");
const RU_RANK =
  "туз\\p{L}*|корол\\p{L}*|дам(?:[аыуео]\\p{L}*)?|(?:валет|вальт)\\p{L}*|(?:десят|девят|восьм[её]р|сем[её]р|шест[её]р|пят[её]р|четв[её]р|трой|двой)к\\p{L}*";
const EN_SUIT = "(?:spade|heart|diamond|club)s?";
const RU_SUIT = "пик\\p{L}*|черв\\p{L}*|бубн\\p{L}*|бубен|треф\\p{L}*|крест\\p{L}*";
const RANK_OF_SUIT = new RegExp(
  `${B}(?:(?:${EN_RANK})s?\\s+of\\s+${EN_SUIT}|(?:${RU_RANK})\\s+(?:${RU_SUIT}))${E}`,
  "gu",
);
const SUIT_SYMBOL = /(?:10|[2-9TJQKA])\s?[♠♥♦♣♤♡♢♧]|[♠♥♦♣♤♡♢♧]\s?(?:10|[2-9TJQKA])/giu;
const EN_RANK_WORD =
  "aces?|kings?|queens?|jacks?|deuces?|tens|nines|eights|sevens|sixes|fives|fours|threes|treys|twos";
const RANK_WORD = new RegExp(`${B}(?:${EN_RANK_WORD}|${RU_RANK})${E}`, "gu");

interface Named {
  text: string;
  rank: string;
  suit: string | null;
}

export function wordCount(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

const prefixed = (word: string, table: readonly [string, string][]): string | null =>
  table.find(([prefix]) => word.startsWith(prefix))?.[1] ?? null;

const rankOf = (word: string): string =>
  prefixed(word, EN_RANKS) ?? prefixed(word, RU_RANKS) ?? (word.startsWith("tre") ? "3" : "?");

function suitIn(text: string): string | null {
  return SUITS.find(([key]) => text.includes(key))?.[1] ?? null;
}

function tokenOf(token: string): Named {
  const rank = token.startsWith("10") ? "T" : token[0].toUpperCase();
  return { text: token, rank, suit: token[token.length - 1].toLowerCase() };
}

function symbolOf(match: string): Named {
  const rank = match.replace(/[♠♥♦♣♤♡♢♧\s]/gu, "").toUpperCase();
  return { text: match, rank: rank === "10" ? "T" : rank, suit: suitIn(match) };
}

function named(text: string): Named[] {
  const found: Named[] = [];
  for (const [token] of text.matchAll(CARD_TOKEN)) {
    if (!AMBIGUOUS_TOKENS.has(token)) found.push(tokenOf(token));
  }
  for (const [match] of text.matchAll(SUIT_SYMBOL)) found.push(symbolOf(match));
  let lower = text.toLowerCase();
  for (const [phrase] of lower.matchAll(RANK_OF_SUIT)) {
    found.push({ text: phrase, rank: rankOf(phrase), suit: suitIn(phrase) });
    lower = lower.replace(phrase, " ");
  }
  for (const [word] of lower.matchAll(RANK_WORD)) {
    found.push({ text: word, rank: rankOf(word), suit: null });
  }
  return found;
}

function publicCards(plan: PlanBody): string[] {
  const { board, card, shown } = plan.facts;
  return [
    ...board,
    ...(card === null ? [] : [card]),
    ...(shown?.her ?? []),
    ...(shown?.player ?? []),
  ];
}

const isPublic = (card: Named, cards: readonly string[]): boolean =>
  cards.some((c) => c[0] === card.rank && (card.suit === null || c[1] === card.suit));

const flat = (text: string): string =>
  normalize(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

export function rejections(
  text: string,
  plan: PlanBody,
  recent: readonly RecentLine[],
): string[] {
  const clean = normalize(text);
  const lower = clean.toLowerCase();
  const reasons: string[] = [];
  if (wordCount(clean) > plan.words.max) reasons.push(`longer than ${plan.words.max} words`);
  const cards = publicCards(plan);
  for (const card of named(clean)) {
    if (!isPublic(card, cards)) reasons.push(`named ${card.text}`);
  }
  if (plan.facts.shown === null && (claimsHolding(lower) || POCKET.test(lower))) {
    reasons.push("told about her hand");
  }
  const said = recent.filter((l) => l.speaker === "mallorca").map((l) => flat(l.text));
  if (said.includes(flat(clean))) reasons.push("repeated a line");
  return [...new Set(reasons)];
}
