import type { Emotion, Snapshot } from '../emotion/index.ts';
import type { Stance, StrengthClass } from '../persona/index.ts';
import type { Act, HandEnd, Occasion, OccasionKind } from './types.ts';

export type Condition =
  | { emotion: Emotion; min: number }
  | { strength: StrengthClass }
  | { presenting: Stance }
  | { overload: number }
  | { end: HandEnd };

export type Chance = number | Readonly<Record<StrengthClass, number>>;

export interface Rule {
  id: string;
  occasion: OccasionKind;
  when: readonly Condition[];
  act: Act;
  chance: Chance;
}

export interface RuleContext {
  occasion: Occasion;
  snapshot: Snapshot;
  presenting: Stance | null;
}

const CLASSES: readonly StrengthClass[] = ['strong', 'medium', 'weak'];

const RAISE_CHANCE = { strong: 0.4, medium: 0.4, weak: 0.3 };

export const RULES: readonly Rule[] = [
  {
    id: 'herBet',
    occasion: 'herBet',
    when: [],
    act: 'press',
    chance: { strong: 0.2, medium: 0.35, weak: 0.6 },
  },
  { id: 'herCall', occasion: 'herCall', when: [], act: 'react', chance: 0.2 },
  { id: 'herFold', occasion: 'herFold', when: [], act: 'react', chance: 0.15 },
  {
    id: 'herFold.anger',
    occasion: 'herFold',
    when: [{ emotion: 'anger', min: 0.3 }],
    act: 'complain',
    chance: 0.3,
  },
  {
    id: 'herFold.shame',
    occasion: 'herFold',
    when: [{ emotion: 'shame', min: 0.3 }],
    act: 'complain',
    chance: 0.3,
  },
  { id: 'playerRaise', occasion: 'playerRaise', when: [], act: 'react', chance: RAISE_CHANCE },
  {
    id: 'playerRaise.fear',
    occasion: 'playerRaise',
    when: [{ emotion: 'fear', min: 0.3 }],
    act: 'stall',
    chance: RAISE_CHANCE,
  },
  {
    id: 'card.surprise',
    occasion: 'card',
    when: [{ emotion: 'surprise', min: 0.4 }],
    act: 'react',
    chance: 0.5,
  },
  {
    id: 'card.fear',
    occasion: 'card',
    when: [{ emotion: 'fear', min: 0.3 }],
    act: 'react',
    chance: 0.3,
  },
  {
    id: 'card.hope',
    occasion: 'card',
    when: [{ emotion: 'hope', min: 0.4 }],
    act: 'react',
    chance: 0.25,
  },
  { id: 'won', occasion: 'handEnded', when: [{ end: 'won' }], act: 'enjoy', chance: 0.5 },
  {
    id: 'won.relief',
    occasion: 'handEnded',
    when: [{ end: 'won' }, { emotion: 'relief', min: 0.3 }],
    act: 'react',
    chance: 0.5,
  },
  { id: 'lost', occasion: 'handEnded', when: [{ end: 'lost' }], act: 'concede', chance: 0.4 },
  {
    id: 'lost.injustice',
    occasion: 'handEnded',
    when: [{ end: 'lost' }, { emotion: 'injustice', min: 0.3 }],
    act: 'complain',
    chance: 0.6,
  },
  {
    id: 'lost.anger',
    occasion: 'handEnded',
    when: [{ end: 'lost' }, { emotion: 'anger', min: 0.4 }],
    act: 'complain',
    chance: 0.5,
  },
  {
    id: 'lost.disappointment',
    occasion: 'handEnded',
    when: [{ end: 'lost' }, { emotion: 'disappointment', min: 0.3 }],
    act: 'react',
    chance: 0.4,
  },
  {
    id: 'bluffCaught',
    occasion: 'handEnded',
    when: [{ end: 'bluffCaught' }],
    act: 'concede',
    chance: 0.9,
  },
  {
    id: 'bluffCaught.shame',
    occasion: 'handEnded',
    when: [{ end: 'bluffCaught' }, { emotion: 'shame', min: 0.3 }],
    act: 'deflect',
    chance: 0.9,
  },
  {
    id: 'playerBluffShown',
    occasion: 'handEnded',
    when: [{ end: 'playerBluffShown' }],
    act: 'tease',
    chance: 0.6,
  },
  { id: 'playerSaid', occasion: 'playerSaid', when: [], act: 'answer', chance: 1 },
];

function felt(context: RuleContext, emotion: Emotion): number {
  const impulse = context.occasion.impulses
    .filter((i) => i.emotion === emotion)
    .reduce((most, i) => Math.max(most, i.amount), 0);
  return Math.max(impulse, context.snapshot.emotions[emotion]);
}

function holds(condition: Condition, context: RuleContext): boolean {
  if ('emotion' in condition) {
    return felt(context, condition.emotion) >= condition.min;
  }
  if ('strength' in condition) {
    return context.occasion.strength === condition.strength;
  }
  if ('presenting' in condition) {
    return context.presenting === condition.presenting;
  }
  if ('overload' in condition) {
    return context.snapshot.load.overload >= condition.overload;
  }
  return context.occasion.end === condition.end;
}

export function matching(rules: readonly Rule[], context: RuleContext): Rule[] {
  return rules.filter(
    (r) => r.occasion === context.occasion.kind && r.when.every((c) => holds(c, context)),
  );
}

export function chosen(matched: readonly Rule[]): Rule | null {
  let best: Rule | null = null;
  for (const r of matched) {
    if (best === null || r.when.length > best.when.length) {
      best = r;
    }
  }
  return best;
}

export function chanceFor(r: Rule, strength: StrengthClass): number {
  return typeof r.chance === 'number' ? r.chance : r.chance[strength];
}

export function speakChanceOf(r: Rule, strength: StrengthClass, mask: number): number {
  const { chance } = r;
  if (typeof chance === 'number') {
    return chance;
  }
  const mean = CLASSES.reduce((sum, c) => sum + chance[c], 0) / CLASSES.length;
  return chance[strength] + mask * (mean - chance[strength]);
}

export function ruleFor(id: string): Rule {
  const found = RULES.find((r) => r.id === id);
  if (found === undefined) {
    throw new Error(`no rule ${id}`);
  }
  return found;
}
