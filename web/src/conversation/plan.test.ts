import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../cards/index.ts';
import type { Emotion } from '../emotion/index.ts';
import { NO_HAND } from '../persona/hand.ts';
import { createPersona } from '../persona/index.ts';
import type { PersonaView, Presenting } from '../persona/index.ts';
import { ACT_WORDS, planOf, voiceOf, wordsFor } from './plan.ts';
import type { SessionLine } from './plan.ts';
import type { Occasion, OccasionKind } from './types.ts';
import type { Verdict } from './verdict.ts';

function view(
  emotions: Partial<Record<Emotion, number>>,
  patch: Partial<PersonaView> = {},
): PersonaView {
  const base = createPersona({ seat: 1, rng: mulberry32(1) }).view(0);
  const zero = Object.fromEntries(Object.keys(base.snapshot.emotions).map((e) => [e, 0]));
  return {
    ...base,
    snapshot: { ...base.snapshot, emotions: { ...base.snapshot.emotions, ...zero, ...emotions } },
    mask: 0,
    presenting: null,
    stance: null,
    ...patch,
  };
}

function occasion(kind: OccasionKind, patch: Partial<Occasion> = {}): Occasion {
  return {
    kind,
    end: null,
    impulses: [],
    journalIds: [],
    handNumber: 4,
    street: 'turn',
    actionStreet: 'flop',
    strength: 'medium',
    endsHand: false,
    hand: NO_HAND,
    text: null,
    previous: null,
    ...patch,
  };
}

const SESSION: SessionLine = {
  hands: 3,
  netBb: -2,
  playerBluffsShown: 0,
  playerAllIns: 0,
  notable: [],
};

describe('what the player hears', () => {
  it('is calm behind a full mask when she acts nothing', () => {
    expect(voiceOf(view({ anger: 0.9 }, { mask: 1 }), occasion('herCall'))).toEqual({
      emotion: 'calm',
      intensity: 0,
    });
  });

  it('is pride when she bluffs behind a full mask', () => {
    const presenting: Presenting = { stance: 'bluff', shows: 'strong', effort: 0.6 };
    expect(voiceOf(view({ fear: 0.8 }, { mask: 1, presenting }), occasion('herBet'))).toEqual({
      emotion: 'pride',
      intensity: 0.5,
    });
  });

  it("puts the occasion's emotion first once it is heard", () => {
    const fear = { emotion: 'fear' as const, amount: 0.4, reason: 'turn' };
    const heard = view({ fear: 0.4, joy: 0.5 }, { mask: 0.5 });
    expect(voiceOf(heard, occasion('card', { impulses: [fear] }))).toEqual({
      emotion: 'fear',
      intensity: 0.2,
    });
    const faint = view({ fear: 0.28, joy: 0.5 }, { mask: 0.5 });
    expect(voiceOf(faint, occasion('card', { impulses: [fear] }))).toEqual({
      emotion: 'joy',
      intensity: 0.25,
    });
  });
});

describe('the word budget', () => {
  it('scales the act by her talkativeness and cuts it under overload', () => {
    expect(ACT_WORDS.react).toEqual({ min: 1, max: 3 });
    expect(wordsFor('react', 0, 0)).toEqual({ min: 1, max: 3 });
    expect(wordsFor('answer', 1, 0)).toEqual({ min: 3, max: 15 });
    expect(wordsFor('tease', 0, 0.6)).toEqual({ min: 3, max: 4 });
    expect(wordsFor('react', -1, 0.6)).toEqual({ min: 1, max: 2 });
    expect(wordsFor('concede', -1, 0)).toEqual({ min: 2, max: 4 });
  });
});

describe('the plan', () => {
  const verdict = (o: Occasion, patch: Partial<Verdict> = {}): Verdict => ({
    occasion: o,
    matched: [],
    rule: 'x',
    act: 'answer',
    chance: null,
    roll: 0,
    sinceLastMs: null,
    speak: true,
    reason: null,
    claim: null,
    ...patch,
  });

  it('carries the claim, what the player said and the fields of staleness', () => {
    const said = occasion('playerSaid', { text: 'nice', street: 'river', actionStreet: 'river' });
    const claim = { about: 'strong' as const, honest: false };
    const plan = planOf({
      verdict: verdict(said, { act: 'claim', claim: { rolls: [0.1, 0.9], claim } }),
      view: view({}),
      humour: null,
      session: SESSION,
      seat: 1,
    });
    expect(plan).toMatchObject({
      version: 2,
      act: 'claim',
      claim,
      heard: 'nice',
      session: SESSION,
      handNumber: 4,
      street: 'river',
      actionStreet: 'river',
      endsHand: false,
      humour: null,
      occasion: 'the player said something',
    });
    expect(plan.words).toEqual(wordsFor('claim', view({}).personality.bigFive.extraversion, 0));
  });
});
