import { PERSONALITIES, createPersona, styleOf, toBotBias } from '../../src/persona/index.ts';
import type { Bias } from '../../src/persona/index.ts';
import type { Personality, PersonalityKey } from '../../src/persona/index.ts';
import { fromBrain } from './arenaBot.ts';
import type { BotFactory } from './arenaBot.ts';
import { SHIPPED, cfrBrainOf } from './cfrModels.ts';
import { createPersonaBot } from './personaBot.ts';

export type ProfileKind = 'style' | 'persona';

export interface ProfileBot {
  kind: ProfileKind;
  personality: Personality;
  label: string;
}

const KINDS: readonly ProfileKind[] = ['style', 'persona'];
const TRAITS = Object.keys(PERSONALITIES.mallorca.bigFive) as (keyof Personality['bigFive'])[];
const HABITS = ['suppression', 'control'] as const;
type Habit = (typeof HABITS)[number];

const isTrait = (key: string): key is keyof Personality['bigFive'] =>
  (TRAITS as string[]).includes(key);
const isHabit = (key: string): key is Habit => (HABITS as readonly string[]).includes(key);

function override(p: Personality, part: string): Personality | null {
  const [key = '', raw] = part.split('=');
  const value = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw);
  if (isTrait(key) && value >= -1 && value <= 1) {
    return { ...p, bigFive: { ...p.bigFive, [key]: value } };
  }
  if (isHabit(key) && value >= 0 && value <= 1) {
    return { ...p, [key]: value };
  }
  return null;
}

function split(name: string): { kind: ProfileKind; key: string; axes: string | null } | null {
  const colon = name.indexOf(':');
  const kind = KINDS.find((k) => k === name.slice(0, colon));
  if (colon < 0 || kind === undefined) return null;
  const rest = name.slice(colon + 1);
  const at = rest.indexOf('@');
  return at < 0
    ? { kind, key: rest, axes: null }
    : { kind, key: rest.slice(0, at), axes: rest.slice(at + 1) };
}

export function profileOfName(name: string): ProfileBot | null {
  const parts = split(name);
  if (parts === null || !Object.hasOwn(PERSONALITIES, parts.key)) return null;
  let personality: Personality | null = PERSONALITIES[parts.key as PersonalityKey];
  for (const part of parts.axes === null ? [] : parts.axes.split(',')) {
    personality = personality === null ? null : override(personality, part);
  }
  if (personality === null) return null;
  const suffix =
    parts.axes === null ? '' : `-${parts.axes.replaceAll('=', '').replaceAll(',', '-')}`;
  return { kind: parts.kind, personality, label: `${parts.kind}-${parts.key}${suffix}` };
}

export function styleBiasOf(p: Personality): Bias {
  return toBotBias(styleOf(p.bigFive));
}

export function profileFactory(profile: ProfileBot): BotFactory {
  const p = profile.personality;
  if (profile.kind === 'style') {
    return (rng) => {
      const brain = cfrBrainOf(SHIPPED, rng);
      brain.setBias(styleBiasOf(p));
      return fromBrain(brain);
    };
  }
  return (rng, seat) =>
    createPersonaBot(cfrBrainOf(SHIPPED, rng), createPersona({ seat, rng, personality: p }), seat);
}
