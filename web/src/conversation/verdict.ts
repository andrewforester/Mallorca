import type { Rng } from '../cards/index.ts';
import type { PersonaView, StrengthClass } from '../persona/index.ts';
import { RULES, chanceFor, chosen, matching, speakChanceOf } from './rules.ts';
import type { Rule } from './rules.ts';
import type { Act, Occasion, OccasionKind } from './types.ts';

export const PACE_MS = 1500;
export const CLAIM_RATE = 0.7;

export type Silence = 'noRule' | 'pace' | 'street' | 'roll' | 'superseded';

export interface Claim {
  about: StrengthClass;
  honest: boolean;
}

export interface ClaimDraw {
  rolls: number[];
  claim: Claim | null;
}

export interface ChanceParts {
  base: number;
  masked: number;
  speakFactor: number;
  final: number;
}

export interface Verdict {
  occasion: Occasion;
  matched: { id: string; act: Act; chance: number }[];
  rule: string | null;
  act: Act | null;
  chance: ChanceParts | null;
  roll: number | null;
  sinceLastMs: number | null;
  speak: boolean;
  reason: Silence | null;
  claim: ClaimDraw | null;
}

export interface Pace {
  lastLineAt: number;
  usedStreets: ReadonlySet<string>;
}

export interface JudgeInput {
  occasions: readonly Occasion[];
  view: PersonaView;
  pace: Pace;
  nowMs: number;
  rules?: readonly Rule[];
}

const CLAIM_KINDS: ReadonlySet<OccasionKind> = new Set(['herBet', 'herCall', 'playerRaise']);

export const streetKey = (handNumber: number, street: string): string => `${handNumber}:${street}`;

function claims(occasion: Occasion): boolean {
  if (occasion.kind === 'playerSaid') {
    return occasion.previous === null || CLAIM_KINDS.has(occasion.previous);
  }
  return CLAIM_KINDS.has(occasion.kind);
}

function drawClaim(occasion: Occasion, view: PersonaView, rng: Rng): ClaimDraw {
  const first = rng.next();
  if (first >= CLAIM_RATE) {
    return { rolls: [first], claim: null };
  }
  const second = rng.next();
  if (second < 1 - view.mask) {
    return { rolls: [first, second], claim: { about: occasion.strength, honest: true } };
  }
  const shows = view.presenting?.shows ?? null;
  return {
    rolls: [first, second],
    claim: shows === null ? null : { about: shows, honest: false },
  };
}

function silenced(
  occasion: Occasion,
  input: JudgeInput,
  sinceLastMs: number | null,
): Silence | null {
  if (occasion.kind === 'playerSaid') {
    return null;
  }
  if (sinceLastMs !== null && sinceLastMs < PACE_MS) {
    return 'pace';
  }
  const used = input.pace.usedStreets.has(streetKey(occasion.handNumber, occasion.actionStreet));
  return used && occasion.kind !== 'handEnded' ? 'street' : null;
}

function chanceOf(rule: Rule, occasion: Occasion, view: PersonaView): ChanceParts {
  const base = chanceFor(rule, occasion.strength);
  const masked = speakChanceOf(rule, occasion.strength, view.mask);
  return {
    base,
    masked,
    speakFactor: view.speakFactor,
    final: Math.min(1, masked * view.speakFactor),
  };
}

function opened(occasion: Occasion, input: JudgeInput): { verdict: Verdict; rule: Rule | null } {
  const { view, pace, nowMs } = input;
  const context = {
    occasion,
    snapshot: view.snapshot,
    presenting: view.presenting?.stance ?? null,
  };
  const list = matching(input.rules ?? RULES, context);
  const rule = chosen(list);
  const verdict: Verdict = {
    occasion,
    matched: list.map((r) => ({ id: r.id, act: r.act, chance: chanceFor(r, occasion.strength) })),
    rule: rule?.id ?? null,
    act: rule?.act ?? null,
    chance: null,
    roll: null,
    sinceLastMs: Number.isFinite(pace.lastLineAt) ? nowMs - pace.lastLineAt : null,
    speak: false,
    reason: null,
    claim: null,
  };
  return { verdict, rule };
}

function drawn(verdict: Verdict, rule: Rule, view: PersonaView, rng: Rng): Verdict {
  const { occasion } = verdict;
  const chance = chanceOf(rule, occasion, view);
  const roll = rng.next();
  if (roll >= chance.final) {
    return { ...verdict, chance, roll, reason: 'roll' };
  }
  const claim = claims(occasion) ? drawClaim(occasion, view, rng) : null;
  const act = claim?.claim ? 'claim' : rule.act;
  return { ...verdict, chance, roll, speak: true, claim, act };
}

function verdictOf(occasion: Occasion, input: JudgeInput, rng: Rng, superseded: boolean): Verdict {
  const { verdict, rule } = opened(occasion, input);
  if (rule === null) {
    return { ...verdict, reason: 'noRule' };
  }
  const gate = superseded ? 'superseded' : silenced(occasion, input, verdict.sinceLastMs);
  return gate === null ? drawn(verdict, rule, input.view, rng) : { ...verdict, reason: gate };
}

export function judge(input: JudgeInput, rng: Rng): Verdict[] {
  const verdicts: Verdict[] = [];
  let spoken = false;
  for (const occasion of [...input.occasions].reverse()) {
    const verdict = verdictOf(occasion, input, rng, spoken);
    spoken ||= verdict.speak;
    verdicts.push(verdict);
  }
  return verdicts;
}
