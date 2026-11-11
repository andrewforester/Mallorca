import { describe, expect, it } from 'vitest';
import {
  APPROACH,
  ATTACK_S,
  CERTAINTY,
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
import { GAME_MOOD, emotionCenter, octantOf, stepAxis, stepMood } from './mood.ts';
import { defaultMoodOf, traitsOf } from './personality.ts';
import type { Personality } from './personality.ts';
import { MALLORCA, PERSONALITIES } from './profiles.ts';
import { BIAS_KEYS } from './biasKeys.ts';

const average: Personality = {
  bigFive: { openness: 0, conscientiousness: 0, extraversion: 0, agreeableness: 0, neuroticism: 0 },
  suppression: 0.3,
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

  it('takes composure from stability and discipline from conscientiousness', () => {
    const t = traitsOf(MALLORCA);
    expect(t.composure).toBeCloseTo(0.55 - 0.35 * 0.1 + 0.1 * 0.2, 12);
    expect(t.discipline).toBeCloseTo(0.45 + 0.3 * 0.2 - 0.25 * 0.1, 12);
    const shaky = { ...average.bigFive, neuroticism: 1, conscientiousness: -1 };
    expect(traitsOf({ ...average, bigFive: shaky }).composure).toBe(0.15);
    const steady = { ...average.bigFive, neuroticism: -1, conscientiousness: 1 };
    expect(traitsOf({ ...average, bigFive: steady }).discipline).toBe(0.95);
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
    expect(t.coping).toBeCloseTo(s(-1.2 * n + 0.6 * e - 0.5 * a), 12);
    expect(t.urgency).toBe(0);
    const rash = { ...average.bigFive, neuroticism: 0.8, conscientiousness: -0.6 };
    expect(traitsOf({ ...average, bigFive: rash }).urgency).toBeCloseTo(0.7, 12);
  });

  it('keeps the stances inside zero and one at the corners', () => {
    for (const sign of [-1, 1]) {
      const corner = {
        openness: sign,
        conscientiousness: sign,
        extraversion: -sign,
        agreeableness: sign,
        neuroticism: sign,
      };
      const t = traitsOf({ ...average, bigFive: corner });
      for (const v of [t.coping, t.selfBlame]) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(1);
      }
      expect(t.urgency).toBeGreaterThanOrEqual(0);
      expect(t.urgency).toBeLessThanOrEqual(1);
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

describe('approach and certainty of the mood', () => {
  const held = (e: Partial<Emotions>, seconds: number, weights = APPROACH): number => {
    let value = 0;
    for (let t = 0; t < seconds; t++) {
      value = stepAxis(value, withEmotions(e), 1, { ...GAME_MOOD, weights });
    }
    return value;
  };

  it('lets small emotions lose to the pull to rest', () => {
    expect(Math.abs(held({ joy: 0.06 }, 600))).toBeLessThan(0.02);
  });

  it('lets strong emotions switch the pull off and move the mood', () => {
    expect(held({ anger: 0.8 }, 600)).toBeGreaterThan(0.2);
    expect(held({ shame: 0.8 }, 600)).toBeLessThan(-0.2);
    expect(held({ fear: 0.5 }, 600, CERTAINTY)).toBeLessThan(-0.1);
  });

  it('returns to zero without emotions and never overshoots', () => {
    const seconds = Math.ceil((GAME_MOOD.returnTimeS / Math.sqrt(3)) * 0.5);
    let value = 0.5;
    for (let t = 0; t < seconds; t++) {
      value = stepAxis(value, noEmotions(), 1, { ...GAME_MOOD, weights: CERTAINTY });
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(value).toBe(0);
  });

  it('gives every emotion the certainty of the addendum', () => {
    expect(CERTAINTY).toEqual({
      anger: 0.6,
      pride: 0.6,
      joy: 0.5,
      relief: 0.4,
      injustice: 0.3,
      disappointment: 0,
      distress: -0.1,
      shame: -0.2,
      hope: -0.2,
      surprise: -0.6,
      fear: -0.7,
    });
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
    engine.event({ kind: 'result', netBb: -60, decided: 'showdown' });
    engine.step(6);
    return engine.snapshot();
  };

  it('overloads a hot profile, not a cold professional, after the same bad beat', () => {
    const lola = badBeat(hot);
    const ingrid = badBeat(cold);
    expect(lola.emotions.injustice).toBeGreaterThan(ingrid.emotions.injustice);
    expect(lola.load.overload).toBeGreaterThan(0.85);
    expect(ingrid.load.overload).toBeLessThan(lola.load.overload);
    expect(lola.load.reach).toBeGreaterThan(4 * ingrid.load.reach);
    expect(lola.bias.looseness).toBeGreaterThan(ingrid.bias.looseness);
  });

  it('feels a big win strongly and lets it reach the play, but is not on tilt', () => {
    const engine = createEngine(hot);
    engine.event({ kind: 'result', netBb: 100, decided: 'showdown', lastEquity: 0.85 });
    engine.step(6);
    const s = engine.snapshot();
    expect(s.emotions.joy).toBeGreaterThan(0.8);
    expect(s.load.reach).toBeGreaterThan(0);
    expect(s.load.strain).toBe(0);
    expect(s.load.overload).toBe(0);
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

  it('remembers who put the money in last and lets it decide the blame', () => {
    const lose = (her: boolean) => {
      const engine = createEngine(PERSONALITIES.sol);
      engine.event({ kind: 'deal', equity: 0.3, potBb: 20, investedBb: 10, streetsLeft: 0 });
      engine.event(
        her
          ? { kind: 'ownMove', move: 'bet', amountBb: 60, potBb: 20, equity: 0.02 }
          : { kind: 'opponentBet', sizeBb: 60, equity: 0.02 },
      );
      engine.event({ kind: 'opponentCall' });
      const impulses = engine.event({ kind: 'result', netBb: -80, decided: 'showdown' });
      const of = (e: string) => impulses.find((i) => i.emotion === e)?.amount ?? 0;
      return { shame: of('shame'), anger: of('anger') };
    };
    expect(lose(true).shame).toBeGreaterThan(lose(true).anger);
    expect(lose(false).anger).toBeGreaterThan(lose(false).shame);
  });

  it('judges the result by the equity before the deciding card', () => {
    const engine = createEngine(MALLORCA);
    engine.event({ kind: 'deal', equity: 0.8, potBb: 120, investedBb: 60 });
    engine.event({ kind: 'street', equity: 0.86, potBb: 120, investedBb: 60 });
    engine.event({ kind: 'street', equity: 0, potBb: 120, investedBb: 60 });
    const impulses = engine.event({ kind: 'result', netBb: -60, decided: 'showdown' });
    expect(impulses.some((i) => i.emotion === 'injustice' && i.amount > 0.3)).toBe(true);
  });

  it('ignores cards shown after the hand is over', () => {
    const engine = createEngine(MALLORCA);
    engine.event({ kind: 'deal', equity: 0.7, potBb: 40, investedBb: 20 });
    engine.event({ kind: 'result', netBb: -20, decided: 'showdown' });
    engine.event({ kind: 'street', equity: 0.9, potBb: 40, investedBb: 20 });
    engine.step(2);
    expect(engine.snapshot().prospect).toBeNull();
    expect(engine.snapshot().emotions.hope).toBe(0);
  });

  it('starts a neutral character from the blueprint', () => {
    expect(Object.values(traitsOf(average).baseline)).toEqual(BIAS_KEYS.map(() => 1));
  });

  it('plays her natural style while calm, whatever her default mood', () => {
    for (const personality of [MALLORCA, hot, cold]) {
      const { bias, traits } = createEngine(personality).snapshot();
      expect(BIAS_KEYS.every((k) => Math.abs(bias[k] - traits.baseline[k]) < 1e-12)).toBe(true);
    }
  });

  it('holds the anger at his raise for the hand and lets it fade after, like hope and fear', () => {
    const hand = (decided: 'heFolded' | 'sheFolded') => {
      const engine = createEngine(PERSONALITIES.sol);
      engine.event({ kind: 'deal', equity: 0.7, potBb: 20, investedBb: 10, streetsLeft: 1 });
      engine.event({ kind: 'opponentBet', sizeBb: 30, equity: 0.5, raise: true });
      engine.step(3);
      const during = engine.snapshot().emotions.anger;
      engine.event({ kind: 'result', netBb: decided === 'heFolded' ? 20 : -10, decided });
      engine.step(10);
      return { during, after: engine.snapshot().emotions.anger };
    };
    const won = hand('heFolded');
    expect(won.during).toBeGreaterThan(0.1);
    expect(won.after).toBeLessThan(0.01);
    const pushed = hand('sheFolded');
    expect(pushed.after).toBeGreaterThan(10 * won.after);
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
    engine.event({ kind: 'result', netBb: -60, decided: 'showdown' });
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

describe('her belief while she bets', () => {
  const riverBluff = (key: 'nina' | 'rita') => {
    const engine = createEngine(PERSONALITIES[key]);
    engine.event({
      kind: 'deal',
      equity: 0.1,
      potBb: 20,
      investedBb: 10,
      stackBb: 90,
      streetsLeft: 0,
    });
    engine.step(5);
    const before = engine.snapshot().emotions;
    engine.event({ kind: 'ownMove', move: 'bet', amountBb: 15, potBb: 20, equity: 0.1 });
    engine.event({
      kind: 'street',
      equity: 0.1,
      potBb: 35,
      investedBb: 25,
      stackBb: 75,
      streetsLeft: 0,
    });
    engine.step(5);
    return { engine, before, after: engine.snapshot().emotions };
  };

  it('frightens the anxious and excites the bold with the same bluff', () => {
    const nina = riverBluff('nina');
    expect(nina.after.fear).toBeGreaterThan(nina.before.fear + 0.1);
    const rita = riverBluff('rita');
    expect(rita.after.hope).toBeGreaterThan(rita.before.hope + 0.1);
  });

  it('goes back to her equity when he calls', () => {
    const { engine } = riverBluff('nina');
    const held = engine.snapshot().emotions.fear;
    engine.event({ kind: 'opponentCall' });
    engine.step(5);
    expect(engine.snapshot().emotions.fear).toBeLessThan(held);
  });

  it('changes nothing when he calls without a bet of hers', () => {
    const engine = createEngine(MALLORCA);
    engine.event({
      kind: 'deal',
      equity: 0.4,
      potBb: 20,
      investedBb: 10,
      stackBb: 90,
      streetsLeft: 1,
    });
    engine.step(3);
    const before = engine.snapshot();
    engine.event({ kind: 'opponentCall' });
    expect(engine.snapshot()).toEqual(before);
  });
});

describe('looking ahead', () => {
  it('reads the snapshot a step later without moving the engine', () => {
    const engine = createEngine(MALLORCA);
    engine.event({ kind: 'result', netBb: -40, lastEquity: 0.1, decided: 'showdown' });
    engine.step(10);
    const before = engine.snapshot();
    const ahead = engine.ahead(3);
    expect(engine.snapshot()).toEqual(before);
    engine.step(3);
    expect(ahead).toEqual(engine.snapshot());
    expect(ahead.emotions.shame).toBeLessThan(before.emotions.shame);
  });
});
