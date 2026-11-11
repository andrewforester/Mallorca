import { describe, expect, it } from 'vitest';
import { appraisalOf, appraise } from './appraisal.ts';
import type { Aggressor, Appraisal, AppraisalContext, Cause, TableEvent } from './appraisal.ts';
import { noEmotions, smoothstep } from './emotions.ts';
import type { Emotion, Emotions } from './emotions.ts';
import { impulsesOf } from './feelings.ts';
import { traitsOf } from './personality.ts';
import type { Personality, Traits } from './personality.ts';
import { MALLORCA, PERSONALITIES } from './profiles.ts';
import { leaningOf } from './tension.ts';

const scaled = (bb: number): number => 1 - Math.exp(-Math.abs(bb) / 20);
const settled = (bb: number): number => Math.abs(bb) / (Math.abs(bb) + 20);

const stance = (coping: number, selfBlame = traitsOf(MALLORCA).selfBlame): Traits => ({
  ...traitsOf(MALLORCA),
  coping,
  selfBlame,
});

const ctx = (traits: Traits, pressure = 0): AppraisalContext => ({
  traits,
  pressure,
  prospect: null,
});

const axes = (event: TableEvent, traits = traitsOf(MALLORCA), pressure = 0): Appraisal => {
  const a = appraisalOf(event, ctx(traits, pressure));
  if (a === null) {
    throw new Error('no appraisal');
  }
  return a;
};

const felt = (
  event: TableEvent,
  traits: Traits,
  now: Emotions = noEmotions(),
): Record<Emotion, number> => {
  const out = { ...noEmotions() } as Record<Emotion, number>;
  for (const i of appraise(event, now, ctx(traits))) {
    out[i.emotion] = 1 - (1 - out[i.emotion]) * (1 - i.amount);
  }
  return out;
};

describe('a lost pot', () => {
  const badBeat: TableEvent = {
    kind: 'result',
    netBb: -100,
    lastEquity: 0.91,
    decided: 'showdown',
  };

  it('gives the cards the share of how far ahead she was', () => {
    const a = axes(badBeat);
    expect(a.realized).toBe(true);
    expect(a.spared).toBe(0);
    expect(a.value).toBeCloseTo(-settled(100), 12);
    expect(a.luck).toBeCloseTo(smoothstep(0.5, 0.95, 0.91), 12);
    expect(a.expected).toBe(0.91);
  });

  it('feels a bad beat as injustice, and as distress when she cannot cope', () => {
    const calm = felt(badBeat, stance(0.75));
    const m = settled(100);
    const luck = smoothstep(0.5, 0.95, 0.91);
    expect(calm.injustice).toBeCloseTo(m * luck * 0.91 * traitsOf(MALLORCA).gains.injustice, 9);
    expect(calm.distress).toBeLessThan(calm.injustice);
    const lost = felt(badBeat, stance(0.18));
    expect(lost.distress).toBeGreaterThan(lost.injustice);
  });

  it('keeps growing with the size of a result, so a lost stack hurts more than a lost buy-in share', () => {
    const lost = (netBb: number) =>
      felt({ kind: 'result', netBb, lastEquity: 0.02, decided: 'showdown' }, traitsOf(MALLORCA));
    expect(lost(-188).distress / lost(-78).distress).toBeGreaterThan(1.1);
    expect(Math.abs(settled(12) - scaled(12))).toBeLessThan(0.1);
  });

  it('blames the opponent with anger or herself with shame by her stance', () => {
    const loss: TableEvent = { kind: 'result', netBb: -40, lastEquity: 0.35, decided: 'showdown' };
    const proud = felt(loss, stance(0.75, 0.1));
    expect(proud.anger).toBeGreaterThan(proud.shame);
    expect(proud.disappointment).toBeLessThan(0.15);
    const humble = felt(loss, stance(0.18, 0.89));
    expect(humble.shame).toBeGreaterThan(humble.anger);
    expect(humble.disappointment).toBeGreaterThan(humble.anger);
  });
});

describe('a won pot', () => {
  it('surprises her when she won from behind, and gives the cards the credit', () => {
    const won = felt(
      { kind: 'result', netBb: 30, lastEquity: 0.2, decided: 'showdown' },
      traitsOf(MALLORCA),
    );
    expect(won.surprise).toBeGreaterThan(0.4);
    expect(won.pride).toBeLessThan(won.joy * 0.5);
  });

  it('turns the fear she holds into relief', () => {
    const t = traitsOf(MALLORCA);
    const won = felt({ kind: 'result', netBb: 30, lastEquity: 0.5, decided: 'showdown' }, t, {
      ...noEmotions(),
      fear: 0.5,
    });
    expect(won.relief).toBeCloseTo(0.5 * t.gains.relief, 12);
  });
});

describe('a bet against her', () => {
  const bet = (equity: number, raise = false, sizeBb = 20): TableEvent => ({
    kind: 'opponentBet',
    sizeBb,
    equity,
    raise,
  });

  it('weighs most when the outcome is open', () => {
    const open = axes(bet(0.5)).value;
    expect(open).toBeCloseTo(-0.6 * scaled(20), 12);
    expect(axes(bet(0.1)).value).toBeCloseTo(open * 0.36, 12);
    expect(axes(bet(0.9)).value).toBeCloseTo(open * 0.36, 12);
    expect(axes(bet(0.5)).realized).toBe(false);
  });

  const challenge = (equity: number, pressure: number, sizeBb = 20): number =>
    axes(bet(equity, true, sizeBb), traitsOf(MALLORCA), pressure).value /
      axes(bet(equity, false, sizeBb)).value -
    1;

  it('makes a raise a bet that challenges her, more so under pressure, softly', () => {
    expect(challenge(0.5, 0)).toBeCloseTo(0.5, 12);
    expect(challenge(0.5, 3)).toBeCloseTo(0.5 * (2 - Math.exp(-1)), 12);
    expect(challenge(0.5, 9)).toBeGreaterThan(challenge(0.5, 3));
    expect(challenge(0.5, 100)).toBeLessThan(1);
  });

  it('weighs the challenge of a raise by its size and by how open the outcome is', () => {
    const raise = (equity: number, sizeBb: number): number =>
      axes(bet(equity, true, sizeBb), traitsOf(MALLORCA), 3).value;
    expect(raise(0.9, 20)).toBeCloseTo(0.36 * raise(0.5, 20), 12);
    expect(raise(0.98, 20)).toBeGreaterThan(-0.06);
    expect(raise(0.5, 5)).toBeGreaterThan(0.5 * raise(0.5, 20));
    expect(raise(0.5, 5)).toBeCloseTo((scaled(5) / scaled(20)) * raise(0.5, 20), 12);
  });

  it('is felt through her leaning: anger when she copes, fear when she does not', () => {
    const t = stance(0.3);
    expect(axes(bet(0.6), t).control).toBeCloseTo(leaningOf(0.3, 0.6), 12);
    const average: Personality = {
      bigFive: {
        openness: 0,
        conscientiousness: 0,
        extraversion: 0,
        agreeableness: 0,
        neuroticism: 0,
      },
      suppression: 0.3,
    };
    const rude = traitsOf({ ...average, bigFive: { ...average.bigFive, agreeableness: -0.8 } });
    const anxious = traitsOf({ ...average, bigFive: { ...average.bigFive, neuroticism: 0.8 } });
    expect(felt(bet(0.6, true), rude).anger).toBeGreaterThan(felt(bet(0.6, true), anxious).anger);
    expect(felt(bet(0.6, true), anxious).fear).toBeGreaterThan(felt(bet(0.6, true), rude).fear);
  });
});

describe('a new card', () => {
  const street = (
    previousEquity: number,
    equity: number,
    cause?: Cause,
    toCallBb?: number,
  ): TableEvent => ({
    kind: 'street',
    equity,
    previousEquity,
    ...(cause === undefined ? {} : { cause }),
    potBb: 6,
    investedBb: 3,
    stackBb: 97,
    streetsLeft: 2,
    ...(toCallBb === undefined ? {} : { toCallBb }),
  });

  it('is not felt when her equity does not change', () => {
    expect(appraise(street(0.5, 0.5), noEmotions(), ctx(traitsOf(MALLORCA)))).toEqual([]);
  });

  it('is felt a little for a small change, with no threshold', () => {
    const small = felt(street(0.5, 0.55), traitsOf(MALLORCA));
    expect(small.hope).toBeGreaterThan(0);
    expect(small.hope).toBeLessThan(0.05);
  });

  it('moves what may still happen, not what happened: hope and fear, no loss', () => {
    const t = traitsOf(MALLORCA);
    expect(axes(street(0.46, 0.85)).realized).toBe(false);
    const flopped = felt(street(0.46, 0.85), t);
    expect(flopped.hope).toBeGreaterThan(0.2);
    expect(flopped.joy).toBe(0);
    const missed = felt(street(0.62, 0.11), t, { ...noEmotions(), hope: 0.4 });
    expect(missed.fear).toBeGreaterThan(0.2);
    for (const e of ['distress', 'injustice', 'anger', 'shame'] as const) {
      expect(missed[e]).toBe(0);
    }
    expect(missed.disappointment).toBeGreaterThan(0);
    expect(missed.disappointment).toBeLessThan(0.5 * missed.fear);
  });

  it('disappoints only the hope she held, lightly', () => {
    const t = traitsOf(MALLORCA);
    const drop = street(0.6, 0.4);
    expect(felt(drop, t).disappointment).toBe(0);
    const hoping = felt(drop, t, { ...noEmotions(), hope: 0.5 }).disappointment;
    expect(hoping).toBeCloseTo(Math.abs(axes(drop).value) * 0.5 * t.gains.disappointment, 12);
  });

  it('surprises by how unlikely the new card was, not by the size of the swing', () => {
    const t = traitsOf(MALLORCA);
    expect(felt(street(0.78, 1), t).surprise).toBe(0);
    expect(felt(street(0.45, 0.24), t).surprise).toBeLessThan(0.02);
    expect(felt(street(0.9, 0), t).surprise).toBeGreaterThan(0.9);
    expect(felt(street(0.1, 1), t).surprise).toBeGreaterThan(0.9);
    expect(felt(street(0.3, 1), t).surprise).toBeGreaterThan(felt(street(0.6, 1), t).surprise);
  });

  it('makes a change that settles the outcome realized, the luck of the cards', () => {
    const t = traitsOf(MALLORCA);
    const revealed = axes(street(0.88, 0));
    expect(revealed.realized).toBe(true);
    expect(revealed.luck).toBe(1);
    const beaten = felt(street(0.88, 0), t);
    expect(beaten.fear).toBe(0);
    expect(beaten.injustice).toBeGreaterThan(0.3);
    expect(beaten.surprise).toBeGreaterThan(0.5);
    expect(axes(street(0.4, 1)).realized).toBe(true);
    expect(axes(street(0.4, 0.99)).realized).toBe(false);
  });

  it('blames the opponent, not the cards, when his action narrows his range', () => {
    const narrowed = street(0.8, 0.3, 'opponent');
    const a = axes(narrowed);
    expect(a.luck).toBe(0);
    expect(a.opponent).toBe(1);
    expect(a.unexpected).toBe(0);
    expect(a.value).toBeCloseTo(axes(street(0.8, 0.3)).value, 12);
    const f = felt(narrowed, traitsOf(MALLORCA));
    expect(f.injustice).toBe(0);
    expect(f.anger).toBeGreaterThan(0.05);
  });

  it('counts her equity only above the price when she faces his bet', () => {
    const t = traitsOf(MALLORCA);
    const polarized = felt(street(0.14, 0.37, 'opponent', 3), t);
    expect(polarized.hope).toBeLessThan(0.05);
    expect(polarized.joy).toBe(0);
    expect(polarized.surprise).toBe(0);
    expect(appraise(street(0.1, 0.25, 'opponent', 3), noEmotions(), ctx(t))).toEqual([]);
    const crushed = axes(street(0.6, 0.2, 'opponent', 3)).value;
    expect(crushed).toBeLessThan(0);
    expect(crushed).toBeGreaterThan(axes(street(0.6, 0.2, 'opponent')).value);
  });

  it('is unknown without the equity before it', () => {
    const first: TableEvent = { kind: 'street', equity: 0.6, potBb: 6, investedBb: 3 };
    expect(appraisalOf(first, ctx(traitsOf(MALLORCA)))).toBeNull();
  });
});

describe('the deal', () => {
  it('greets a premium starting hand with hope and junk with nothing', () => {
    const t = traitsOf(MALLORCA);
    const aces = felt({ kind: 'deal', equity: 0.85, potBb: 3, investedBb: 1.5 }, t);
    expect(aces.hope).toBeCloseTo(0.6 * t.gains.hope, 12);
    expect(aces.joy).toBe(0);
    const trash = { kind: 'deal', equity: 0.35, potBb: 3, investedBb: 1.5 } as const;
    expect(appraise(trash, noEmotions(), ctx(t))).toEqual([]);
  });
});

describe('her own bet', () => {
  it('gives no feeling of its own: belief carries it', () => {
    const bet: TableEvent = { kind: 'ownMove', move: 'bet', amountBb: 15, potBb: 20, equity: 0.1 };
    expect(appraise(bet, noEmotions(), ctx(traitsOf(MALLORCA)))).toEqual([]);
    expect(appraise({ kind: 'opponentCall' }, noEmotions(), ctx(traitsOf(MALLORCA)))).toEqual([]);
  });
});

describe('who decided the outcome', () => {
  it('gives her the credit when he folds to her bet, pride by her coping', () => {
    const t = stance(0.75);
    const through: TableEvent = { kind: 'result', netBb: 20, lastEquity: 0, decided: 'heFolded' };
    const a = axes(through, t);
    expect([a.luck, a.unexpected]).toEqual([0, 0]);
    expect(a.self).toBeCloseTo(0.9, 12);
    const won = felt(through, t);
    expect(won.pride).toBeCloseTo(settled(20) * 0.9 * t.gains.pride, 12);
    expect(won.surprise).toBe(0);
    expect(Object.values(won).every(Number.isFinite)).toBe(true);
  });

  it('makes a caught bluff a showdown loss: shame for the self-blaming, anger for the others', () => {
    const caught: TableEvent = { kind: 'result', netBb: -15, lastEquity: 0.1, decided: 'showdown' };
    const humble = felt(caught, stance(0.18, 0.89));
    expect(humble.shame).toBeGreaterThan(humble.anger);
    const proud = felt(caught, stance(0.75, 0.1));
    expect(proud.anger).toBeGreaterThan(proud.shame);
  });

  it('makes a pot lost to her own bet mostly her doing, one lost calling his bet mostly his', () => {
    const t = stance(0.6, 0.29);
    const lost = (aggressor?: Aggressor): Appraisal =>
      axes({ kind: 'result', netBb: -40, lastEquity: 0.35, decided: 'showdown', aggressor }, t);
    const share = (x: number): number => 1 / (1 + ((1 - x) / x) * Math.exp(-Math.log(3)));
    expect(lost().self).toBeCloseTo(0.29 * (1 - lost().luck), 12);
    expect(lost('her').self).toBeCloseTo(share(0.29) * (1 - lost('her').luck), 12);
    expect(lost('him').self).toBeLessThan(lost().self);
    expect(lost('her').self + lost('her').opponent).toBeCloseTo(1 - lost('her').luck, 12);
  });

  it('feels her own caught bluff as shame more than anger, even when she rarely blames herself', () => {
    const sol = traitsOf(PERSONALITIES.sol);
    const caught = felt(
      { kind: 'result', netBb: -111, lastEquity: 0.02, decided: 'showdown', aggressor: 'her' },
      sol,
    );
    expect(caught.shame).toBeGreaterThan(caught.anger);
    const called = felt(
      { kind: 'result', netBb: -111, lastEquity: 0.02, decided: 'showdown', aggressor: 'him' },
      sol,
    );
    expect(called.anger).toBeGreaterThan(called.shame);
  });

  it('feels the money she folded as a loss, with her own share of the blame', () => {
    const fold = (netBb: number, lastEquity: number, toCallBb = 0): TableEvent => ({
      kind: 'result',
      netBb,
      lastEquity,
      decided: 'sheFolded',
      toCallBb,
    });
    const a = axes(fold(-24.5, 0.01), stance(0.3, 0.8));
    expect(a.realized).toBe(true);
    expect(a.self).toBeCloseTo(0.8, 12);
    expect(a.value).toBeCloseTo(-settled(24.5), 12);
    expect(a.luck).toBe(0);
    const humble = felt(fold(-24.5, 0.01), stance(0.3, 0.8));
    expect(humble.distress).toBeGreaterThan(0.2);
    expect(humble.shame).toBeGreaterThan(humble.anger);
    const proud = felt(fold(-24.5, 0.01), stance(0.75, 0.1));
    expect(proud.anger).toBeGreaterThan(proud.shame);
    const pushed = axes({ ...fold(-24.5, 0.01), aggressor: 'him' } as TableEvent, stance(0.3, 0.8));
    expect(pushed.self).toBeLessThan(a.self);
    expect(pushed.self + pushed.opponent).toBeCloseTo(1, 12);
    expect(felt(fold(-20, 0.7), stance(0.3)).disappointment).toBeGreaterThan(
      felt(fold(-20, 0.1), stance(0.3)).disappointment,
    );
  });

  it('relieves the fear of a fold by what the fold saved her, not by the fear alone', () => {
    const t = traitsOf(MALLORCA);
    const afraid = { ...noEmotions(), fear: 0.6 };
    const fold = (toCallBb: number, belief: number): TableEvent => ({
      kind: 'result',
      netBb: -9.65,
      lastEquity: belief,
      decided: 'sheFolded',
      toCallBb,
    });
    expect(axes(fold(19.3, 0.37)).spared).toBeCloseTo(settled(0.63 * 19.3), 12);
    const big = felt(fold(19.3, 0.37), t, afraid);
    expect(big.relief).toBeCloseTo(0.6 * settled(0.63 * 19.3) * t.gains.relief, 12);
    expect(big.relief).toBeLessThan(0.6 * t.gains.relief * 0.5);
    expect(big.distress).toBeGreaterThan(0);
    expect(felt(fold(2, 0.37), t, afraid).relief).toBeLessThan(big.relief);
    expect(felt(fold(19.3, 0.8), t, afraid).relief).toBeLessThan(big.relief);
    expect(felt(fold(0, 0.37), t, afraid).relief).toBe(0);
  });
});

describe('chat', () => {
  it('reads every signal as the opponent, realized or prospective', () => {
    const cases = [
      ['tease', -0.25, true],
      ['mockBluff', -0.35, true],
      ['compliment', 0.25, true],
      ['friendly', 0.1, true],
      ['claimStrength', -0.12, false],
      ['claimWeakness', 0.1, false],
    ] as const;
    for (const [signal, value, realized] of cases) {
      const a = axes({ kind: 'chat', signal });
      expect(a.value).toBe(value);
      expect(a.realized).toBe(realized);
      expect(a.opponent).toBe(1);
    }
  });
});

describe('impulsesOf', () => {
  it('drops what is too small to feel and applies her gains', () => {
    const t = traitsOf(MALLORCA);
    const tiny: Appraisal = {
      value: 0.004,
      realized: true,
      spared: 0,
      self: 0,
      opponent: 0,
      luck: 1,
      expected: 0,
      unexpected: 0,
      control: 0.5,
      reason: 'tiny',
    };
    expect(impulsesOf(tiny, noEmotions(), t)).toEqual([]);
    const joy = impulsesOf({ ...tiny, value: 0.5 }, noEmotions(), t);
    expect(joy).toEqual([{ emotion: 'joy', amount: 0.5 * t.gains.joy, reason: 'tiny' }]);
  });
});
