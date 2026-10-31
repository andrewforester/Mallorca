import { describe, expect, it } from 'vitest';
import { appraise, prospectTargets } from './appraisal.ts';
import type { Prospect } from './appraisal.ts';
import { addImpulse, decay, noEmotions } from './emotions.ts';
import type { Emotions } from './emotions.ts';
import { createEngine } from './engine.ts';
import { emotionCenter, octantOf, stepMood } from './mood.ts';
import { defaultMoodOf, traitsOf } from './personality.ts';
import type { Personality } from './personality.ts';
import { MALLORCA } from './profiles.ts';
import { driversOf, styleOf } from './style.ts';
import { LEAK_FLOOR, loadOf } from './load.ts';

const average: Personality = {
  bigFive: { openness: 0, conscientiousness: 0, extraversion: 0, agreeableness: 0, neuroticism: 0 },
  suppression: 0.3,
  experience: 0.5,
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
  experience: 0.2,
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
  experience: 0.9,
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
});

describe('appraisal', () => {
  const traits = traitsOf(average);

  it('raises hope with equity and fear with what is invested', () => {
    const strong: Prospect = { equity: 0.9, potBb: 60, investedBb: 30 };
    const weak: Prospect = { equity: 0.2, potBb: 60, investedBb: 30 };
    expect(prospectTargets(strong, traits).hope).toBeGreaterThan(
      prospectTargets(weak, traits).hope,
    );
    expect(prospectTargets(weak, traits).fear).toBeGreaterThan(
      prospectTargets(strong, traits).fear,
    );
  });

  it('turns a loss from a winning position into injustice and surprise', () => {
    const emotions = withEmotions({ hope: 0.7, fear: 0.1 });
    const badBeat = appraise({ kind: 'result', netBb: -60, lastEquity: 0.86 }, emotions, traits);
    const cooler = appraise({ kind: 'result', netBb: -60, lastEquity: 0.1 }, emotions, traits);
    const amount = (list: typeof badBeat, emotion: string) =>
      list.filter((i) => i.emotion === emotion).reduce((sum, i) => sum + i.amount, 0);
    expect(amount(badBeat, 'injustice')).toBeGreaterThan(0.3);
    expect(amount(badBeat, 'surprise')).toBeGreaterThan(0.3);
    expect(amount(cooler, 'injustice')).toBeLessThan(0.05);
    expect(amount(badBeat, 'disappointment')).toBeCloseTo(0.7 * traits.gains.disappointment);
  });

  it('turns fear into relief when the hand is won', () => {
    const impulses = appraise(
      { kind: 'result', netBb: 40, lastEquity: 0.5 },
      withEmotions({ fear: 0.5 }),
      traits,
    );
    const relief = impulses.find((i) => i.emotion === 'relief');
    expect(relief?.amount).toBeCloseTo(0.5 * traits.gains.relief);
  });

  it('counts what can still be won on later streets, not only the pot', () => {
    const now: Prospect = { equity: 0.85, potBb: 6, investedBb: 3 };
    const ahead: Prospect = { ...now, stackBb: 97, streetsLeft: 2 };
    expect(prospectTargets(ahead, traits).hope).toBeGreaterThan(
      prospectTargets(now, traits).hope + 0.2,
    );
  });

  it('meets a flopped straight with joy as well as surprise', () => {
    const impulses = appraise(
      {
        kind: 'street',
        equity: 0.85,
        potBb: 6,
        investedBb: 3,
        stackBb: 97,
        streetsLeft: 2,
        previousEquity: 0.46,
      },
      noEmotions(),
      traits,
    );
    expect(impulses.find((i) => i.emotion === 'joy')?.amount).toBeGreaterThan(0.2);
    expect(impulses.find((i) => i.emotion === 'surprise')?.amount).toBeGreaterThan(0.4);
  });

  it('takes a raise as a challenge: anger for the disagreeable, fear for the anxious', () => {
    const rude = traitsOf({ ...average, bigFive: { ...average.bigFive, agreeableness: -0.8 } });
    const anxious = traitsOf({ ...average, bigFive: { ...average.bigFive, neuroticism: 0.8 } });
    const raise = {
      kind: 'opponentBet',
      sizeBb: 14,
      equity: 0.6,
      raise: true,
      pressure: 0,
    } as const;
    const amount = (t: typeof rude, emotion: string) =>
      appraise(raise, noEmotions(), t).find((i) => i.emotion === emotion)?.amount ?? 0;
    expect(amount(rude, 'anger')).toBeGreaterThan(amount(anxious, 'anger'));
    expect(amount(anxious, 'fear')).toBeGreaterThan(amount(rude, 'fear'));
  });

  it('greets a premium starting hand with joy', () => {
    const aces = appraise(
      { kind: 'deal', equity: 0.85, potBb: 3, investedBb: 1.5 },
      noEmotions(),
      traits,
    );
    const trash = appraise(
      { kind: 'deal', equity: 0.35, potBb: 3, investedBb: 1.5 },
      noEmotions(),
      traits,
    );
    expect(aces.find((i) => i.emotion === 'joy')?.amount).toBeGreaterThan(0.4);
    expect(trash).toEqual([]);
  });

  it('answers a big swing on a street with surprise', () => {
    const impulses = appraise(
      { kind: 'street', equity: 0.9, potBb: 20, investedBb: 10, previousEquity: 0.3 },
      noEmotions(),
      traits,
    );
    expect(impulses.some((i) => i.emotion === 'surprise' && i.amount > 0.3)).toBe(true);
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

describe('style', () => {
  it('is neutral when calm', () => {
    const style = styleOf(driversOf(noEmotions(), [0, 0, 0], 0), 0.3);
    expect(Object.values(style).every((v) => Math.abs(v - 1) < 1e-9)).toBe(true);
  });

  it('plays fear tighter and anger more aggressively, with more bluffs', () => {
    const fear = styleOf(driversOf(withEmotions({ fear: 0.8 }), [0, 0, 0], 0), 0.8);
    const anger = styleOf(driversOf(withEmotions({ anger: 0.8 }), [0, 0, 0], 0), 0.8);
    expect(fear.aggression).toBeLessThan(1);
    expect(fear.looseness).toBeLessThan(1);
    expect(anger.aggression).toBeGreaterThan(1.3);
    expect(anger.bluff).toBeGreaterThan(anger.aggression);
  });

  it('plays a big session loss loose and sticky', () => {
    const style = styleOf(driversOf(noEmotions(), [0, 0, 0], -300), 0.8);
    expect(style.looseness).toBeGreaterThan(1.2);
    expect(style.stickiness).toBeGreaterThan(1.2);
  });

  it('holds the style near neutral with little leakage', () => {
    const drivers = driversOf(withEmotions({ fear: 0.8 }), [0, 0, 0], 0);
    expect(Math.abs(styleOf(drivers, 0.05).aggression - 1)).toBeLessThan(0.03);
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
    expect(lola.style.looseness).toBeGreaterThan(ingrid.style.looseness);
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

  it('damps the joy of the deal when the hand is lost', () => {
    const engine = createEngine(MALLORCA);
    engine.event({ kind: 'deal', equity: 0.85, potBb: 3, investedBb: 1.5 });
    const before = engine.snapshot().emotions.joy;
    engine.event({ kind: 'result', netBb: -30 });
    expect(engine.snapshot().emotions.joy).toBeCloseTo(before * 0.3);
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

  it('plays the blueprint while calm, whatever her default mood', () => {
    for (const personality of [MALLORCA, hot, cold]) {
      const style = createEngine(personality).snapshot().style;
      expect(Object.values(style).every((v) => Math.abs(v - 1) < 1e-12)).toBe(true);
    }
  });

  it('clears hope and fear when the hand ends', () => {
    const after = badBeat(MALLORCA);
    expect(after.emotions.hope).toBeLessThan(0.05);
    expect(after.prospect).toBeNull();
    expect(after.sessionNetBb).toBe(-60);
  });
});
