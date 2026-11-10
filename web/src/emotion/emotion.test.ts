import { describe, expect, it } from 'vitest';
import {
  APPROACH,
  ATTACK_S,
  EMOTIONS,
  EMOTION_PAD,
  addImpulse,
  decay,
  noEmotions,
  queue,
  rise,
} from './emotions.ts';
import type { Emotions } from './emotions.ts';
import { createEngine } from './engine.ts';
import { emotionCenter, octantOf, stepMood } from './mood.ts';
import { defaultMoodOf, traitsOf } from './personality.ts';
import type { Personality } from './personality.ts';
import { MALLORCA } from './profiles.ts';
import { BIAS_KEYS, BIAS_RANGE, biasOf, driversOf } from './bias.ts';
import { LEAK_FLOOR, loadOf } from './load.ts';

const average: Personality = {
  bigFive: { openness: 0, conscientiousness: 0, extraversion: 0, agreeableness: 0, neuroticism: 0 },
  suppression: 0.3,
  control: 0.5,
};

const FAST_MOOD = { changeTimeS: 20, returnTimeS: 40 };

const hot: Personality = {
  bigFive: {
    openness: 0.6,
    conscientiousness: -0.4,
    extraversion: 0.9,
    agreeableness: 0.5,
    neuroticism: 0.5,
  },
  suppression: 0.08,
  control: 0.2,
};

const cold: Personality = {
  bigFive: {
    openness: -0.1,
    conscientiousness: 0.7,
    extraversion: -0.5,
    agreeableness: -0.3,
    neuroticism: -0.6,
  },
  suppression: 0.85,
  control: 0.9,
};

const withEmotions = (values: Partial<Emotions>): Emotions => ({ ...noEmotions(), ...values });

describe('personality', () => {
  it('maps the Big Five to the default mood with the Mehrabian weights', () => {
    const mood = defaultMoodOf({
      openness: 0.4,
      conscientiousness: 0.8,
      extraversion: 0.6,
      agreeableness: 0.3,
      neuroticism: -0.4,
    });
    expect(mood[0]).toBeCloseTo(0.21 * 0.6 + 0.59 * 0.3 + 0.19 * 0.4);
    expect(mood[1]).toBeCloseTo(0.15 * 0.4 + 0.3 * 0.3 - 0.57 * 0.4);
    expect(mood[2]).toBeCloseTo(0.25 * 0.4 + 0.17 * 0.8 + 0.6 * 0.6 - 0.32 * 0.3);
  });

  it('gives a neurotic personality stronger fear, slower recovery and less composure', () => {
    const calm = traitsOf(average);
    const anxious = traitsOf({ ...average, bigFive: { ...average.bigFive, neuroticism: 0.8 } });
    expect(anxious.gains.fear).toBeGreaterThan(calm.gains.fear);
    expect(anxious.halfLifeFactor.distress).toBeGreaterThan(calm.halfLifeFactor.distress);
    expect(anxious.composure).toBeLessThan(calm.composure);
  });

  it('takes composure and discipline from conscientiousness, neuroticism and self-control', () => {
    const b = MALLORCA.bigFive;
    const t = traitsOf(MALLORCA);
    const composure = 0.45 + 0.15 * b.conscientiousness - 0.25 * b.neuroticism + 0.2 * 0.7;
    const discipline = 0.25 + 0.2 * b.conscientiousness - 0.15 * b.neuroticism + 0.5 * 0.7;
    expect(t.composure).toBeCloseTo(composure, 12);
    expect(t.discipline).toBeCloseTo(discipline, 12);
  });

  it('derives whom she blames, how she copes and how rash she gets', () => {
    const b = MALLORCA.bigFive;
    const s = (x: number): number => 1 / (1 + Math.exp(-x));
    const c = b.conscientiousness;
    const n = b.neuroticism;
    const a = b.agreeableness;
    const e = b.extraversion;
    const t = traitsOf(MALLORCA);
    expect(t.selfBlame).toBeCloseTo(s(1.2 * c + 0.8 * n + 0.8 * a - 0.6 * e), 12);
    expect(t.coping).toBeCloseTo(s(-1.2 * n + 0.6 * e - 0.5 * a + 0.7 - 0.5), 12);
    expect(t.urgency).toBe(0);
    const rash = { ...average.bigFive, neuroticism: 0.8, conscientiousness: -0.6 };
    expect(traitsOf({ ...average, bigFive: rash }).urgency).toBeCloseTo(0.7, 12);
  });

  it('keeps the stances inside zero and one at the corners', () => {
    for (const sign of [-1, 1]) {
      for (const control of [0, 1]) {
        const corner = {
          openness: sign,
          conscientiousness: sign,
          extraversion: -sign,
          agreeableness: sign,
          neuroticism: sign,
        };
        const t = traitsOf({ ...average, bigFive: corner, control });
        for (const v of [t.coping, t.selfBlame]) {
          expect(v).toBeGreaterThan(0);
          expect(v).toBeLessThan(1);
        }
        expect(t.urgency).toBeGreaterThanOrEqual(0);
        expect(t.urgency).toBeLessThanOrEqual(1);
      }
    }
  });

  it('makes a disagreeable personality angrier at the same provocation', () => {
    const kind = traitsOf({ ...average, bigFive: { ...average.bigFive, agreeableness: 0.8 } });
    const rude = traitsOf({ ...average, bigFive: { ...average.bigFive, agreeableness: -0.8 } });
    expect(rude.gains.anger).toBeGreaterThan(kind.gains.anger);
  });
});

describe('emotions', () => {
  it('saturates impulses below one', () => {
    const once = addImpulse(noEmotions(), 'joy', 0.6);
    const twice = addImpulse(once, 'joy', 0.6);
    expect(once.joy).toBeCloseTo(0.6);
    expect(twice.joy).toBeCloseTo(0.84);
  });

  it('halves an emotion after its half-life', () => {
    const start = withEmotions({ joy: 0.8 });
    const later = decay(start, 30, () => 1);
    expect(later.joy).toBeCloseTo(0.4);
  });

  const risen = (amount: number, steps: number, dt: number): Emotions => {
    let state = { emotions: noEmotions(), pending: queue({}, 'joy', amount) };
    for (let i = 0; i < steps; i++) {
      state = rise(state.emotions, state.pending, dt);
    }
    return state.emotions;
  };

  it('lands a queued impulse as exactly one saturated impulse', () => {
    expect(ATTACK_S).toBe(0.5);
    expect(risen(0.42, 200, 0.05).joy).toBeCloseTo(addImpulse(noEmotions(), 'joy', 0.42).joy, 6);
  });

  it('lands half of the log mass after the attack time, in any split of steps', () => {
    const half = 1 - Math.exp(Math.log(0.58) / 2);
    expect(risen(0.42, 10, 0.05).joy).toBeCloseTo(half, 9);
    expect(risen(0.42, 1, 0.5).joy).toBeCloseTo(half, 9);
  });

  it('queues a full impulse without infinity', () => {
    const joy = risen(1, 40, 0.25).joy;
    expect(Number.isFinite(joy)).toBe(true);
    expect(joy).toBeGreaterThanOrEqual(0.999);
    expect(joy).toBeLessThan(1);
  });

  it('gives every emotion the approach of its dominance, except anger and injustice', () => {
    for (const e of EMOTIONS) {
      if (e === 'anger' || e === 'injustice') {
        continue;
      }
      expect(APPROACH[e]).toBe(EMOTION_PAD[e][2]);
    }
    expect(APPROACH.anger).toBe(0.6);
    expect(APPROACH.injustice).toBe(0.4);
  });
});

describe('mood', () => {
  const config = { changeTimeS: 600, returnTimeS: 1200 };

  it('finds the emotion center as the intensity weighted mean', () => {
    const center = emotionCenter(withEmotions({ joy: 0.5, anger: 0.5 }));
    expect(center?.center[0]).toBeCloseTo((0.4 - 0.51) / 2);
    expect(center?.intensity).toBeCloseTo(0.5);
  });

  it('pulls the mood toward the emotion center and returns it to default without emotions', () => {
    const pulled = stepMood([0, 0, 0], withEmotions({ anger: 1 }), 60, {
      ...config,
      defaultMood: [0, 0, 0],
    });
    expect(pulled[0]).toBeLessThan(0);
    expect(pulled[1]).toBeGreaterThan(0);
    const back = stepMood([-0.5, 0.5, 0.2], noEmotions(), 1200, {
      ...config,
      defaultMood: [0.1, 0, 0.1],
    });
    expect(back[0]).toBeCloseTo(0.1);
  });

  it('lets steady emotions win over the return to the default mood', () => {
    let mood: readonly [number, number, number] = [0.3, 0.1, 0.1];
    for (let i = 0; i < 90; i++) {
      mood = stepMood(mood, withEmotions({ distress: 0.6 }), 0.1, {
        ...FAST_MOOD,
        defaultMood: [0.3, 0.1, 0.1],
      });
    }
    expect(mood[0]).toBeLessThan(0.25);
  });

  it('pushes a mood beyond the center further into its octant', () => {
    const pushed = stepMood([-0.6, 0.6, 0.3], withEmotions({ anger: 1 }), 30, {
      ...config,
      defaultMood: [0, 0, 0],
    });
    expect(pushed[0]).toBeLessThan(-0.6);
  });

  it('names the octant and its strength', () => {
    expect(octantOf([0.25, -0.18, 0.12])).toEqual({ octant: 'relaxed', strength: 'slightly' });
    expect(octantOf([-0.7, 0.8, 0.6]).octant).toBe('hostile');
  });
});

describe('load', () => {
  const traits = traitsOf(average);

  it('adds up the negative emotions, the bad mood and the session loss', () => {
    const reading = loadOf(withEmotions({ anger: 0.5, shame: 0.5 }), [-0.4, 0, 0], -200, traits);
    expect(reading.parts.anger).toBeCloseTo(0.5);
    expect(reading.parts.shame).toBeCloseTo(0.4);
    expect(reading.parts.mood).toBeCloseTo(0.2);
    expect(reading.parts.desperation).toBeGreaterThan(0.5);
    expect(reading.load).toBeCloseTo(Object.values(reading.parts).reduce((a, b) => a + b, 0));
  });

  it('does not call a single lost pot desperation', () => {
    expect(loadOf(noEmotions(), [0, 0, 0], -60, traits).parts.desperation).toBeLessThan(0.15);
  });

  it('lets a calm player leak only the floor and an overloaded one almost everything', () => {
    const calm = loadOf(withEmotions({ distress: 0.2 }), [0, 0, 0], 0, traits);
    const boiling = loadOf(withEmotions({ anger: 1, injustice: 1 }), [0, 0, 0], 0, traits);
    expect(calm.overload).toBeLessThan(0.05);
    expect(calm.leakage).toBeCloseTo((1 - traits.discipline) * LEAK_FLOOR, 1);
    expect(boiling.overload).toBeGreaterThan(0.95);
    expect(boiling.leakage).toBeCloseTo(1 - traits.discipline, 1);
  });

  it('names the emotion that feeds the load most', () => {
    expect(loadOf(withEmotions({ anger: 0.9 }), [0, 0, 0], 0, traits).dominant).toBe('anger');
    expect(loadOf(noEmotions(), [0, 0, 0], -400, traits).dominant).toBe('desperation');
  });
});

describe('bias', () => {
  it('is neutral when calm', () => {
    const bias = biasOf(driversOf(noEmotions(), [0, 0, 0], 0), 0.3);
    expect(Object.values(bias).every((v) => Math.abs(v - 1) < 1e-9)).toBe(true);
  });

  it('plays fear tighter and anger more aggressively, with more bluffs', () => {
    const fear = biasOf(driversOf(withEmotions({ fear: 0.8 }), [0, 0, 0], 0), 0.8);
    const anger = biasOf(driversOf(withEmotions({ anger: 0.8 }), [0, 0, 0], 0), 0.8);
    expect(fear.aggression).toBeLessThan(1);
    expect(fear.looseness).toBeLessThan(1);
    expect(anger.aggression).toBeGreaterThan(1.3);
    expect(anger.bluff).toBeGreaterThan(anger.aggression);
  });

  it('plays a big session loss loose and sticky', () => {
    const bias = biasOf(driversOf(noEmotions(), [0, 0, 0], -300), 0.8);
    expect(bias.looseness).toBeGreaterThan(1.2);
    expect(bias.stickiness).toBeGreaterThan(1.2);
  });

  it('multiplies her baseline', () => {
    const calm = driversOf(noEmotions(), [0, 0, 0], 0);
    const ones = Object.fromEntries(BIAS_KEYS.map((k) => [k, 1])) as Record<
      (typeof BIAS_KEYS)[number],
      number
    >;
    expect(biasOf(calm, 0.3, { ...ones, aggression: 1.2 }).aggression).toBeCloseTo(1.2, 9);
  });

  it('clamps the baseline times the emotional part', () => {
    const angry = driversOf(withEmotions({ anger: 0.8 }), [0, 0, 0], 0);
    const ones = Object.fromEntries(BIAS_KEYS.map((k) => [k, 1])) as Record<
      (typeof BIAS_KEYS)[number],
      number
    >;
    expect(biasOf(angry, 0.8, { ...ones, aggression: 1.8 }).aggression).toBe(BIAS_RANGE[1]);
  });

  it('starts a neutral character from a neutral baseline', () => {
    expect(Object.values(traitsOf(average).baseline)).toEqual(BIAS_KEYS.map(() => 1));
  });

  it('holds the bias near neutral with little leakage', () => {
    const drivers = driversOf(withEmotions({ fear: 0.8 }), [0, 0, 0], 0);
    expect(Math.abs(biasOf(drivers, 0.05).aggression - 1)).toBeLessThan(0.03);
  });
});

describe('engine', () => {
  const badBeat = (personality: Personality) => {
    const engine = createEngine(personality);
    engine.event({ kind: 'deal', equity: 0.8, potBb: 3, investedBb: 1.5 });
    engine.step(2);
    engine.event({ kind: 'street', equity: 0.92, potBb: 120, investedBb: 60 });
    engine.step(2);
    engine.event({ kind: 'street', equity: 0.86, potBb: 120, investedBb: 60 });
    engine.step(2);
    engine.event({ kind: 'street', equity: 0, potBb: 120, investedBb: 60 });
    engine.step(0.5);
    engine.event({ kind: 'result', netBb: -60 });
    engine.step(6);
    return engine.snapshot();
  };

  it('overloads a hot profile, not a cold professional, after the same bad beat', () => {
    const lola = badBeat(hot);
    const ingrid = badBeat(cold);
    expect(lola.emotions.injustice).toBeGreaterThan(ingrid.emotions.injustice);
    expect(lola.load.overload).toBeGreaterThan(0.9);
    expect(ingrid.load.overload).toBeLessThan(lola.load.overload);
    expect(lola.bias.looseness).toBeGreaterThan(ingrid.bias.looseness);
  });

  it('remembers raises against her and angers more with each one', () => {
    const engine = createEngine({
      ...average,
      bigFive: { ...average.bigFive, agreeableness: -0.6 },
    });
    engine.event({
      kind: 'deal',
      equity: 0.6,
      potBb: 10,
      investedBb: 7,
      stackBb: 93,
      streetsLeft: 2,
    });
    const first = engine.event({ kind: 'opponentBet', sizeBb: 14, equity: 0.6, raise: true });
    const second = engine.event({ kind: 'opponentBet', sizeBb: 30, equity: 0.6, raise: true });
    const anger = (list: typeof first) => list.find((i) => i.emotion === 'anger')?.amount ?? 0;
    expect(anger(first)).toBeGreaterThan(0.1);
    expect(anger(second)).toBeGreaterThan(anger(first));
  });

  it('judges the result by the equity before the deciding card', () => {
    const engine = createEngine(MALLORCA);
    engine.event({ kind: 'deal', equity: 0.8, potBb: 120, investedBb: 60 });
    engine.event({ kind: 'street', equity: 0.86, potBb: 120, investedBb: 60 });
    engine.event({ kind: 'street', equity: 0, potBb: 120, investedBb: 60 });
    const impulses = engine.event({ kind: 'result', netBb: -60 });
    expect(impulses.some((i) => i.emotion === 'injustice' && i.amount > 0.3)).toBe(true);
  });

  it('ignores cards shown after the hand is over', () => {
    const engine = createEngine(MALLORCA);
    engine.event({ kind: 'deal', equity: 0.7, potBb: 40, investedBb: 20 });
    engine.event({ kind: 'result', netBb: -20 });
    engine.event({ kind: 'street', equity: 0.9, potBb: 40, investedBb: 20 });
    engine.step(2);
    expect(engine.snapshot().prospect).toBeNull();
    expect(engine.snapshot().emotions.hope).toBe(0);
  });

  it('plays her natural style while calm, whatever her default mood', () => {
    for (const personality of [MALLORCA, hot, cold]) {
      const { bias, traits } = createEngine(personality).snapshot();
      expect(BIAS_KEYS.every((k) => Math.abs(bias[k] - traits.baseline[k]) < 1e-12)).toBe(true);
    }
  });

  it('lets hope and fear fade after the hand instead of dropping them', () => {
    const engine = createEngine(MALLORCA);
    engine.event({
      kind: 'deal',
      equity: 0.5,
      potBb: 120,
      investedBb: 60,
      stackBb: 40,
      streetsLeft: 1,
    });
    engine.step(3);
    const during = engine.snapshot().emotions;
    expect(during.hope + during.fear).toBeGreaterThan(0.3);
    engine.event({ kind: 'result', netBb: -60 });
    expect(engine.snapshot().prospect).toBeNull();
    expect(engine.snapshot().sessionNetBb).toBe(-60);
    engine.step(0.5);
    expect(engine.snapshot().emotions.hope).toBeGreaterThan(0);
    expect(engine.snapshot().emotions.fear).toBeGreaterThan(0);
    engine.step(9.5);
    expect(engine.snapshot().emotions.hope).toBeLessThan(0.01);
    expect(engine.snapshot().emotions.fear).toBeLessThan(0.01);
  });
});

describe('looking ahead', () => {
  it('reads the snapshot a step later without moving the engine', () => {
    const engine = createEngine(MALLORCA);
    engine.event({ kind: 'bluff', succeeded: false, potBb: 40 });
    engine.step(10);
    const before = engine.snapshot();
    const ahead = engine.ahead(3);
    expect(engine.snapshot()).toEqual(before);
    engine.step(3);
    expect(ahead).toEqual(engine.snapshot());
    expect(ahead.emotions.shame).toBeLessThan(before.emotions.shame);
  });
});
