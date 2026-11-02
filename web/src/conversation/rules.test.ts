import { describe, expect, it } from 'vitest';
import { MALLORCA, createEngine } from '../emotion/index.ts';
import type { Emotion, Impulse, Snapshot } from '../emotion/index.ts';
import { NO_HAND } from '../persona/hand.ts';
import type { StrengthClass } from '../persona/index.ts';
import { BASE_HABITS, habitsAt } from './habits.ts';
import { RULES, chanceFor, chosen, matching, ruleFor, speakChanceOf } from './rules.ts';
import type { RuleContext } from './rules.ts';
import type { HandEnd, Occasion, OccasionKind } from './types.ts';

const CLASSES: StrengthClass[] = ['strong', 'medium', 'weak'];

function snapshotWith(emotions: Partial<Record<Emotion, number>>, overload = 0): Snapshot {
  const base = createEngine(MALLORCA).snapshot();
  return {
    ...base,
    emotions: { ...base.emotions, ...emotions },
    load: { ...base.load, overload },
  };
}

function occasion(
  kind: OccasionKind,
  end: HandEnd | null = null,
  impulses: Impulse[] = [],
): Occasion {
  return {
    kind,
    end,
    impulses,
    journalIds: [],
    handNumber: 1,
    street: 'flop',
    actionStreet: 'flop',
    strength: 'medium',
    endsHand: kind === 'handEnded',
    hand: NO_HAND,
    text: null,
    previous: null,
  };
}

const context = (o: Occasion, s: Snapshot = snapshotWith({})): RuleContext => ({
  occasion: o,
  snapshot: s,
  presenting: null,
});

const pick = (c: RuleContext) => chosen(matching(RULES, c))?.id ?? null;

describe('rules', () => {
  it('chooses the most specific rule, then the first of the table', () => {
    const lost = occasion('handEnded', 'lost');
    expect(pick(context(lost, snapshotWith({ injustice: 0.4, disappointment: 0.4 })))).toBe(
      'lost.injustice',
    );
    expect(pick(context(lost))).toBe('lost');
    expect(pick(context(lost, snapshotWith({ disappointment: 0.3 })))).toBe('lost.disappointment');
  });

  it('reads an emotion from the impulses of the occasion or from her state', () => {
    const fear: Impulse = { emotion: 'fear', amount: 0.3, reason: 'turn' };
    expect(pick(context(occasion('card', null, [fear])))).toBe('card.fear');
    expect(pick(context(occasion('card'), snapshotWith({ surprise: 0.4 })))).toBe('card.surprise');
    expect(pick(context(occasion('card'), snapshotWith({ fear: 0.29 })))).toBeNull();
  });

  it('upsets a fold by anger or by shame', () => {
    expect(pick(context(occasion('herFold'), snapshotWith({ anger: 0.3 })))).toBe('herFold.anger');
    expect(pick(context(occasion('herFold'), snapshotWith({ shame: 0.3 })))).toBe('herFold.shame');
    expect(pick(context(occasion('herFold')))).toBe('herFold');
  });

  it('keeps a rule of one hand end to that end', () => {
    expect(pick(context(occasion('handEnded', 'won')))).toBe('won');
    expect(pick(context(occasion('handEnded', 'bluffCaught'), snapshotWith({ shame: 0.3 })))).toBe(
      'bluffCaught.shame',
    );
    expect(pick(context(occasion('handEnded', 'playerBluffShown')))).toBe('playerBluffShown');
  });

  it('answers every line of the player', () => {
    expect(pick(context(occasion('playerSaid')))).toBe('playerSaid');
    expect(chanceFor(ruleFor('playerSaid'), 'weak')).toBe(1);
  });

  it('moves a chance per class toward its mean by the mask', () => {
    const bet = ruleFor('herBet');
    for (const c of CLASSES) {
      expect(speakChanceOf(bet, c, 1)).toBeCloseTo((0.2 + 0.35 + 0.6) / 3, 12);
    }
    expect(speakChanceOf(bet, 'weak', 0)).toBe(0.6);
    expect(speakChanceOf(ruleFor('won'), 'weak', 0.7)).toBe(0.5);
  });

  it('gives the arena the chances of the habits it had', () => {
    for (const mask of [0, 0.5, 0.9]) {
      const habits = habitsAt(BASE_HABITS, mask);
      for (const c of CLASSES) {
        expect(speakChanceOf(ruleFor('herBet'), c, mask)).toBeCloseTo(habits.herBet[c].speak, 12);
      }
    }
  });
});
