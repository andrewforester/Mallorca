import { describe, expect, it } from 'vitest';
import type { TableEvent } from './appraisal.ts';
import {
  EMOTIONS,
  HALF_LIFE_HANDS,
  HALF_LIFE_S,
  REFERENCE_HAND_S,
  addImpulse,
  decay,
  noEmotions,
} from './emotions.ts';
import type { Emotion, Emotions } from './emotions.ts';
import { createEngine } from './engine.ts';
import type { Engine } from './engine.ts';
import { GAME_MOOD, stepMood } from './mood.ts';
import { traitsOf } from './personality.ts';
import { PERSONALITIES } from './profiles.ts';

const BODY: readonly Emotion[] = ['hope', 'fear', 'relief', 'surprise'];

const REFERENCE_HALF_LIFE_S: Readonly<Record<Emotion, number>> = {
  hope: 6,
  fear: 6,
  joy: 30,
  distress: 40,
  relief: 15,
  disappointment: 30,
  pride: 45,
  shame: 60,
  anger: 60,
  injustice: 90,
  surprise: 1.2,
};

const all = (value: number): Emotions =>
  Object.fromEntries(EMOTIONS.map((e) => [e, value])) as Record<Emotion, number>;

describe('the two clocks of decay', () => {
  it('adds the seconds and the hands in one exponent', () => {
    const later = decay(
      all(0.8),
      { seconds: HALF_LIFE_S.distress, hands: HALF_LIFE_HANDS.distress },
      () => 1,
    );
    expect(later.distress).toBeCloseTo(0.2);
  });

  it('cools the body by the clock alone, hands do not touch it', () => {
    const later = decay(all(0.8), { seconds: 0, hands: 1000 }, () => 1);
    for (const e of BODY) {
      expect(later[e]).toBe(0.8);
    }
  });

  it('fades every feeling about an outcome with new hands', () => {
    const later = decay(all(0.8), { seconds: 0, hands: 1 }, () => 1);
    for (const e of EMOTIONS.filter((name) => !BODY.includes(name))) {
      expect(later[e]).toBeLessThan(0.8);
    }
  });

  it('keeps the reference half-life of every emotion at the reference pace', () => {
    for (const e of EMOTIONS) {
      const rate = 1 / HALF_LIFE_S[e] + 1 / (HALF_LIFE_HANDS[e] * REFERENCE_HAND_S);
      expect(1 / rate).toBeCloseTo(REFERENCE_HALF_LIFE_S[e], 6);
    }
  });

  it('scales both half-lives by the trait factor', () => {
    const later = decay(all(0.8), { seconds: 2 * 80, hands: 2 * 4 }, () => 2);
    expect(later.distress).toBeCloseTo(
      0.8 * 0.5 ** (80 / HALF_LIFE_S.distress + 4 / HALF_LIFE_HANDS.distress),
    );
  });
});

const VERA = PERSONALITIES.vera;
const distressFactor = traitsOf(VERA).halfLifeFactor.distress;

const BAD_BEAT: TableEvent = { kind: 'result', netBb: -100, decided: 'showdown', lastEquity: 0.9 };
const NEW_HAND: TableEvent = {
  kind: 'deal',
  equity: 0.5,
  potBb: 1.5,
  investedBb: 0.5,
  stackBb: 100,
  streetsLeft: 3,
};

const beaten = (): { engine: Engine; landed: number } => {
  const engine = createEngine(VERA);
  const impulses = engine.event(BAD_BEAT);
  const landed = impulses
    .filter((i) => i.emotion === 'distress')
    .reduce((e, i) => addImpulse(e, 'distress', i.amount), noEmotions()).distress;
  return { engine, landed };
};

const playHands = (engine: Engine, hands: number, secondsPerHand: number): number => {
  for (let i = 0; i < hands; i++) {
    engine.step(secondsPerHand);
    engine.event(NEW_HAND);
  }
  return engine.snapshot().emotions.distress;
};

describe('her distress after a bad beat, at any pace', () => {
  it('lands a pending feeling at a new hand and fades it by one hand', () => {
    const { engine, landed } = beaten();
    expect(landed).toBeGreaterThan(0.3);
    engine.event(NEW_HAND);
    const expected = landed * 0.5 ** (1 / (HALF_LIFE_HANDS.distress * distressFactor));
    expect(engine.snapshot().emotions.distress).toBeCloseTo(expected, 6);
  });

  it('lets a bad beat go after a bounded number of hands when she clicks instantly', () => {
    const { engine, landed } = beaten();
    const hands = Math.ceil(2 * HALF_LIFE_HANDS.distress * distressFactor);
    expect(playHands(engine, hands, 0.01)).toBeLessThan(landed / 4);
  });

  it('cools her in a long pause without hands', () => {
    const { engine, landed } = beaten();
    engine.step(600);
    expect(engine.snapshot().emotions.distress).toBeLessThan(landed / 20);
  });

  it('cools less per hand in fast play than in slow play, a third of the gap of the clock alone', () => {
    const fast = playHands(beaten().engine, 3, 5);
    const slow = playHands(beaten().engine, 3, 60);
    expect(fast).toBeGreaterThan(slow);
    const halfLivesFast = Math.log2(beaten().landed / fast);
    const halfLivesSlow = Math.log2(beaten().landed / slow);
    expect(halfLivesSlow / halfLivesFast).toBeLessThan(60 / 5 / 3);
  });
});

describe('the mood over a session, at any pace', () => {
  const after = (hands: number, secondsPerHand: number): number => {
    let mood: readonly [number, number, number] = [0, 0, 0];
    const felt = { ...noEmotions(), distress: 0.1 };
    for (let i = 0; i < hands; i++) {
      mood = stepMood(
        mood,
        felt,
        { seconds: secondsPerHand, hands: 1 },
        {
          ...GAME_MOOD,
          defaultMood: [0, 0, 0],
        },
      );
    }
    return Math.hypot(...mood);
  };

  it('gives fifty fast hands and fifty slow hands a similar arc', () => {
    const fast = after(50, 5);
    const slow = after(50, 60);
    expect(fast).toBeGreaterThan(0);
    expect(slow / fast).toBeLessThan(2);
  });

  it('moves at the reference pace as the clock alone did before', () => {
    const moved = after(30, REFERENCE_HAND_S);
    expect(moved).toBeCloseTo((0.1 / 600) * 30 * REFERENCE_HAND_S, 6);
  });
});
