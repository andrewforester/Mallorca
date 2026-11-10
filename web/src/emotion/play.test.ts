import { describe, expect, it } from 'vitest';
import { BIAS_KEYS } from './biasKeys.ts';
import { APPROACH, CERTAINTY, EMOTIONS, EMOTION_PAD, noEmotions } from './emotions.ts';
import type { Emotion, Emotions, Pad } from './emotions.ts';
import type { Affect } from './play.ts';
import { traitsOf } from './personality.ts';
import type { BigFive, Personality } from './personality.ts';
import {
  MOOD_WEIGHT,
  PLAY_AXES,
  PUSH_GAIN,
  URGENCY_PUSH,
  affectOf,
  partsOf,
  playOf,
} from './play.ts';
import { MALLORCA, PERSONALITIES } from './profiles.ts';
import { STYLE_SHARE } from './style.ts';

const persona = (bigFive: BigFive): Personality => ({ bigFive, suppression: 0.3 });

const BRASH = persona({
  openness: 0.8,
  conscientiousness: -0.7,
  extraversion: 0.9,
  agreeableness: -0.6,
  neuroticism: -0.4,
});
const ANXIOUS = persona({
  openness: -0.3,
  conscientiousness: 0.8,
  extraversion: -0.4,
  agreeableness: 0.3,
  neuroticism: 0.8,
});
const IMPULSIVE = persona({
  openness: 0.5,
  conscientiousness: -0.6,
  extraversion: 0.7,
  agreeableness: 0.2,
  neuroticism: 0.8,
});
const STILL = { shift: [0, 0, 0] as Pad, approach: 0, certainty: 0 };

const feeling = (values: Partial<Emotions>): Emotions => ({ ...noEmotions(), ...values });

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe('play constants', () => {
  it('follows the spec', () => {
    expect([MOOD_WEIGHT, PUSH_GAIN, URGENCY_PUSH]).toEqual([2, 2, 0.8]);
    expect(PLAY_AXES).toEqual({
      aggression: [0.1, 0.3, 1, 0],
      looseness: [-0.5, -0.3, 0.2, 0.6],
      bluff: [0, 0.2, 0.6, 0.6],
      sizing: [0, 0.4, 0.5, 0.5],
      stickiness: [0.3, 0.2, 0.8, 0],
    });
  });

  it('gives each emotion at 1 the push of the addendum on bluff, sizing and looseness', () => {
    const table: Record<string, [number, number, number]> = {
      anger: [0.84, 0.84, 0.56],
      pride: [0.6, 0.57, 0.13],
      injustice: [0.52, 0.55, 0.36],
      relief: [0.42, 0.28, 0.31],
      joy: [0.4, 0.38, 0.06],
      hope: [-0.14, -0.07, -0.3],
      disappointment: [-0.22, -0.16, 0.04],
      surprise: [-0.3, -0.11, -0.61],
      distress: [-0.4, -0.38, 0.1],
      shame: [-0.46, -0.36, -0.12],
      fear: [-0.56, -0.33, -0.37],
    };
    for (const [name, pushes] of Object.entries(table)) {
      const e = name as Emotion;
      const point = [EMOTION_PAD[e][0], EMOTION_PAD[e][1], APPROACH[e], CERTAINTY[e]];
      const along = (k: 'bluff' | 'sizing' | 'looseness'): number =>
        PLAY_AXES[k].reduce((sum, w, i) => sum + w * (point[i] ?? 0), 0);
      expect(Math.abs(along('bluff') - pushes[0])).toBeLessThan(0.01);
      expect(Math.abs(along('sizing') - pushes[1])).toBeLessThan(0.01);
      expect(Math.abs(along('looseness') - pushes[2])).toBeLessThan(0.01);
    }
  });
});

describe('affectOf', () => {
  it('sums the emotions on pleasure, arousal and approach, and twice the mood shift', () => {
    const a = affectOf(
      feeling({ anger: 0.5, joy: 0.2 }),
      { shift: [0.1, -0.05, 0], approach: -0.2, certainty: 0.1 },
      0,
    );
    const p = 0.5 * EMOTION_PAD.anger[0] + 0.2 * EMOTION_PAD.joy[0] + 2 * 0.1;
    const ar = 0.5 * EMOTION_PAD.anger[1] + 0.2 * EMOTION_PAD.joy[1] - 2 * 0.05;
    const ap = 0.5 * APPROACH.anger + 0.2 * APPROACH.joy - 2 * 0.2;
    expect(a[0]).toBeCloseTo(p, 12);
    expect(a[1]).toBeCloseTo(ar, 12);
    expect(a[2]).toBeCloseTo(ap, 12);
    expect(a[3]).toBeCloseTo(0.5 * CERTAINTY.anger + 0.2 * CERTAINTY.joy + 2 * 0.1, 12);
  });

  it('turns arousal into action only for the impulsive', () => {
    const anger = feeling({ anger: 0.8 });
    const rash = traitsOf(IMPULSIVE);
    const steady = traitsOf(ANXIOUS);
    expect(steady.urgency).toBe(0);
    const arousal = 0.8 * EMOTION_PAD.anger[1];
    const gap = affectOf(anger, STILL, rash.urgency)[2] - affectOf(anger, STILL, 0)[2];
    expect(gap).toBeCloseTo(0.8 * rash.urgency * arousal, 12);
    expect(affectOf(anger, STILL, steady.urgency)).toEqual(affectOf(anger, STILL, 0));
  });
});

describe('certainty alone', () => {
  it('steers nothing while pleasure, arousal and approach are still', () => {
    const t = traitsOf(MALLORCA);
    const r = playOf([0, 0, 0, 0.5], t);
    expect(r.intensity).toBe(0);
    expect(r.reach).toBe(0);
    expect(r.bias).toEqual(t.baseline);
  });
});

describe('partsOf', () => {
  it('lists the length of each emotion and of the mood in a fixed order', () => {
    const parts = partsOf(feeling({ fear: 0.5 }), {
      shift: [0.1, 0, 0],
      approach: 0,
      certainty: 0.4,
    });
    expect(parts.map(([k]) => k)).toEqual([...EMOTIONS, 'mood']);
    const pad = EMOTION_PAD.fear;
    const fear = 0.5 * Math.hypot(pad[0], pad[1], APPROACH.fear);
    expect(parts.find(([k]) => k === 'fear')?.[1]).toBeCloseTo(fear, 12);
    expect(parts.find(([k]) => k === 'mood')?.[1]).toBeCloseTo(0.2, 12);
  });
});

describe('playOf', () => {
  it('plays the natural style when she feels nothing', () => {
    const t = traitsOf(MALLORCA);
    const reading = playOf(affectOf(noEmotions(), STILL, t.urgency), t);
    expect(reading.intensity).toBe(0);
    expect(reading.reach).toBe(0);
    expect(reading.overload).toBe(0);
    expect(reading.bias).toEqual(t.baseline);
  });

  it('lets through half of what discipline allows when the feeling equals composure', () => {
    const t = traitsOf(MALLORCA);
    const a: Affect = [0, 0, t.composure, 0.3];
    const reading = playOf(a, t);
    expect(reading.intensity).toBeCloseTo(t.composure, 12);
    expect(reading.overload).toBeCloseTo(0.5, 12);
    expect(reading.reach).toBeCloseTo(0.5 * (1 - t.discipline), 12);
  });

  it('pushes the style along the projection of the affect', () => {
    const t = traitsOf(MALLORCA);
    const a: Affect = [0.3, -0.2, 0.6, 0.4];
    const r = playOf(a, t);
    const intensity = Math.hypot(0.3, -0.2, 0.6);
    const w = PLAY_AXES.bluff;
    const along = w[0] * a[0] + w[1] * a[1] + w[2] * a[2] + w[3] * a[3];
    const push = (2 * r.reach * along) / intensity;
    expect(r.bias.bluff).toBeCloseTo(
      2 ** Math.tanh(Math.atanh(STYLE_SHARE) * t.nature.bluff + push),
      12,
    );
  });

  it('plays anger up for the brash and fear down for the anxious', () => {
    const brash = traitsOf(BRASH);
    const angry = playOf(affectOf(feeling({ anger: 0.8 }), STILL, brash.urgency), brash);
    expect(angry.bias.aggression).toBeGreaterThan(brash.baseline.aggression);
    const anxious = traitsOf(ANXIOUS);
    const afraid = playOf(affectOf(feeling({ fear: 0.8 }), STILL, anxious.urgency), anxious);
    expect(afraid.bias.aggression).toBeLessThan(anxious.baseline.aggression);
  });

  it('keeps every style strictly inside the range for any state of any character', () => {
    const next = lcg(11);
    const people = [...Object.values(PERSONALITIES), BRASH, ANXIOUS, IMPULSIVE];
    for (let i = 0; i < 500; i++) {
      const e = Object.fromEntries(EMOTIONS.map((k) => [k, next()])) as Record<string, number>;
      const shift: Pad = [4 * next() - 2, 4 * next() - 2, 4 * next() - 2];
      for (const p of people) {
        const t = traitsOf(p);
        const mood = { shift, approach: 2 * next() - 1, certainty: 2 * next() - 1 };
        const r = playOf(affectOf(e as Emotions, mood, t.urgency), t);
        for (const k of BIAS_KEYS) {
          expect(r.bias[k]).toBeGreaterThan(0.5);
          expect(r.bias[k]).toBeLessThan(2);
        }
      }
    }
  });
});
