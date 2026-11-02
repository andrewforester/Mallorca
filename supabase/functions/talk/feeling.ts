export const FEELING_VERSION = 1;

export const EMOTIONS = [
  "hope",
  "fear",
  "joy",
  "distress",
  "relief",
  "disappointment",
  "pride",
  "shame",
  "anger",
  "injustice",
  "surprise",
] as const;
export type Emotion = typeof EMOTIONS[number];

export const OCTANTS = [
  "exuberant",
  "bored",
  "dependent",
  "disdainful",
  "relaxed",
  "anxious",
  "docile",
  "hostile",
] as const;
export type Octant = typeof OCTANTS[number];

export const STRENGTHS = ["slightly", "moderately", "fully"] as const;
export type MoodStrength = typeof STRENGTHS[number];

export const LOAD_SOURCES = [
  "anger",
  "injustice",
  "shame",
  "distress",
  "disappointment",
  "fear",
  "mood",
  "desperation",
] as const;
export type LoadSource = typeof LOAD_SOURCES[number];

export const ACTED = ["strong", "medium", "weak"] as const;
export type Acted = typeof ACTED[number];

export const MAX_EMOTIONS = 3;

export interface FeltEmotion {
  name: Emotion;
  intensity: number;
}

export interface Feeling {
  version: typeof FEELING_VERSION;
  emotions: FeltEmotion[];
  mood: { octant: Octant; strength: MoodStrength };
  overload: { level: number; source: LoadSource | null };
  shows: { mask: number; acting: Acted | null };
}

export const CHARACTER_TRAITS = ["talkativeness", "warmth", "nerves", "wit"] as const;
export type CharacterTrait = typeof CHARACTER_TRAITS[number];

export type Character = { version: typeof FEELING_VERSION } & Record<CharacterTrait, number>;

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isUnit = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

const isOneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (options as readonly string[]).includes(value);

export const UNKNOWN = Symbol("unknown version");

function parseEmotion(value: unknown): FeltEmotion | null {
  if (!isRecord(value) || !isOneOf(EMOTIONS, value.name) || !isUnit(value.intensity)) return null;
  return { name: value.name, intensity: value.intensity };
}

function parseEmotions(value: unknown): FeltEmotion[] | null {
  if (!Array.isArray(value) || value.length > MAX_EMOTIONS) return null;
  const emotions = value.map(parseEmotion);
  return emotions.every((e) => e !== null) ? emotions as FeltEmotion[] : null;
}

function parseMood(value: unknown): Feeling["mood"] | null {
  if (!isRecord(value)) return null;
  const { octant, strength } = value;
  return isOneOf(OCTANTS, octant) && isOneOf(STRENGTHS, strength) ? { octant, strength } : null;
}

function parseOverload(value: unknown): Feeling["overload"] | null {
  if (!isRecord(value) || !isUnit(value.level)) return null;
  const { source } = value;
  if (source !== null && !isOneOf(LOAD_SOURCES, source)) return null;
  return { level: value.level, source };
}

function parseShows(value: unknown): Feeling["shows"] | null {
  if (!isRecord(value) || !isUnit(value.mask)) return null;
  const { acting } = value;
  if (acting !== null && !isOneOf(ACTED, acting)) return null;
  return { mask: value.mask, acting };
}

export function parseFeeling(value: unknown): Feeling | null | typeof UNKNOWN {
  if (value === undefined) return UNKNOWN;
  if (!isRecord(value)) return null;
  if (value.version !== FEELING_VERSION) return UNKNOWN;
  const emotions = parseEmotions(value.emotions);
  const mood = parseMood(value.mood);
  const overload = parseOverload(value.overload);
  const shows = parseShows(value.shows);
  if (emotions === null || mood === null || overload === null || shows === null) return null;
  return { version: FEELING_VERSION, emotions, mood, overload, shows };
}

export function parseCharacter(value: unknown): Character | null | typeof UNKNOWN {
  if (value === undefined) return UNKNOWN;
  if (!isRecord(value)) return null;
  if (value.version !== FEELING_VERSION) return UNKNOWN;
  if (!CHARACTER_TRAITS.every((trait) => isUnit(value[trait]))) return null;
  const traits = Object.fromEntries(CHARACTER_TRAITS.map((trait) => [trait, value[trait]]));
  return { version: FEELING_VERSION, ...traits } as Character;
}
