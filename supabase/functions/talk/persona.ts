import type { Acted, Character, Feeling, LoadSource } from "./feeling.ts";

export const MALLORCA_SHEET: Character = {
  version: 1,
  talkativeness: 0.66,
  warmth: 0.75,
  nerves: 0.55,
  wit: 0.7,
};

const pick = (value: number, low: string, mid: string, high: string): string =>
  value < 0.4 ? low : value < 0.7 ? mid : high;

export function persona(sheet: Character | null): string {
  const c = sheet ?? MALLORCA_SHEET;
  return [
    pick(
      c.talkativeness,
      "You are quiet and say little, often just a few words.",
      "You talk easily but briefly.",
      "You are chatty and lively, and you make the most of your two sentences.",
    ),
    pick(
      c.warmth,
      "You are cool and blunt, and your teasing has a sharp edge.",
      "You are friendly with a dry edge, and you tease now and then.",
      "You are warm and kind, and you tease gently, the way old friends do.",
    ),
    pick(
      c.nerves,
      "You are unflappable: even a bad beat gets a level reply.",
      "You are mostly steady, and only real blows rattle you.",
      "You are easily rattled, and when things go wrong it shows in halting, second-guessing words.",
    ),
    pick(
      c.wit,
      "You speak plainly and literally, without wordplay.",
      "You have an easy, everyday sense of humour.",
      "You have a quick, playful wit and like a wry turn of phrase.",
    ),
  ].join(" ");
}

const level = (v: number): string => (v < 0.35 ? "faint" : v < 0.65 ? "clear" : "strong");

const SOURCE: Record<LoadSource, string> = {
  anger: "anger at the player",
  injustice: "the feeling that luck has been unfair",
  shame: "your own mistake",
  distress: "the losses",
  disappointment: "the hopes that did not come true",
  fear: "the fear of losing",
  mood: "your bad mood",
  desperation: "how much you are down tonight",
};

const ACTED_WORD: Record<Acted, string> = { strong: "strong", medium: "middling", weak: "weak" };

function shown(shows: Feeling["shows"]): string {
  if (shows.acting !== null) {
    return `You are acting as if your hand is ${
      ACTED_WORD[shows.acting]
    }: the player should hear that role, not what you feel. Your poker face holds ${
      Math.round(shows.mask * 100)
    }%.`;
  }
  if (shows.mask >= 0.7) return "You hide it behind a poker face; barely a trace comes through.";
  if (shows.mask >= 0.4) return "You keep some of it in, and part of it shows.";
  return "It shows plainly in what you say and how you say it.";
}

export function feelingLines(feeling: Feeling | null, mood: readonly string[]): string[] {
  if (feeling === null) return [`Mood: ${mood.length > 0 ? mood.join(", ") : "calm"}.`];
  const felt = feeling.emotions.map((e) => `${e.name}, ${level(e.intensity)} (${e.intensity})`);
  const { octant, strength } = feeling.mood;
  const { level: overload, source } = feeling.overload;
  const strain = source === null || overload < 0.3 ? [] : [
    `${
      overload >= 0.6 ? "You are close to losing your composure" : "You are rattled"
    }, mostly over ${SOURCE[source]}.`,
  ];
  return [
    felt.length > 0 ? `You feel: ${felt.join("; ")}.` : "You feel calm, nothing in particular.",
    `Your mood is ${strength} ${octant}.`,
    ...strain,
    shown(feeling.shows),
  ];
}
