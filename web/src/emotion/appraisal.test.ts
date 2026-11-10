import { describe, expect, it } from 'vitest';
import { appraisalOf, appraise } from './appraisal.ts';
import type { Appraisal, AppraisalContext, TableEvent } from './appraisal.ts';
import { noEmotions, smoothstep } from './emotions.ts';
import type { Emotion, Emotions } from './emotions.ts';
import { impulsesOf } from './feelings.ts';
import { traitsOf } from './personality.ts';
import type { Personality, Traits } from './personality.ts';
import { MALLORCA } from './profiles.ts';
import { leaningOf } from './tension.ts';

const scaled = (bb: number): number => 1 - Math.exp(-Math.abs(bb) / 20);

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
  const badBeat: TableEvent = { kind: 'result', netBb: -100, lastEquity: 0.91 };

  it('gives the cards the share of how far ahead she was', () => {
    const a = axes(badBeat);
    expect(a.realized).toBe(true);
    expect(a.resolved).toBe(1);
    expect(a.value).toBeCloseTo(-scaled(100), 12);
    expect(a.luck).toBeCloseTo(smoothstep(0.5, 0.95, 0.91), 12);
    expect(a.expected).toBe(0.91);
  });

  it('feels a bad beat as injustice, and as distress when she cannot cope', () => {
    const calm = felt(badBeat, stance(0.75));
    const m = scaled(100);
    const luck = smoothstep(0.5, 0.95, 0.91);
    expect(calm.injustice).toBeCloseTo(m * luck * 0.91 * traitsOf(MALLORCA).gains.injustice, 9);
    expect(calm.distress).toBeLessThan(calm.injustice);
    const lost = felt(badBeat, stance(0.18));
    expect(lost.distress).toBeGreaterThan(lost.injustice);
  });

  it('blames the opponent with anger or herself with shame by her stance', () => {
    const loss: TableEvent = { kind: 'result', netBb: -40, lastEquity: 0.35 };
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
    const won = felt({ kind: 'result', netBb: 30, lastEquity: 0.2 }, traitsOf(MALLORCA));
    expect(won.surprise).toBeGreaterThan(0.4);
    expect(won.pride).toBeLessThan(won.joy * 0.5);
  });

  it('turns the fear she holds into relief', () => {
    const t = traitsOf(MALLORCA);
    const won = felt({ kind: 'result', netBb: 30, lastEquity: 0.5 }, t, {
      ...noEmotions(),
      fear: 0.5,
    });
    expect(won.relief).toBeCloseTo(0.5 * t.gains.relief, 12);
  });
});

describe('a bet against her', () => {
  const bet = (equity: number, raise = false): TableEvent => ({
    kind: 'opponentBet',
    sizeBb: 20,
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

  it('adds a challenge for a raise that grows with the pressure', () => {
    const plain = axes(bet(0.5)).value;
    expect(axes(bet(0.5, true), traitsOf(MALLORCA), 3).value - plain).toBeCloseTo(-0.12 * 2.5, 12);
    expect(axes(bet(0.5, true), traitsOf(MALLORCA), 9).value - plain).toBeCloseTo(-0.12 * 2.5, 12);
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
      control: 0.5,
    };
    const rude = traitsOf({ ...average, bigFive: { ...average.bigFive, agreeableness: -0.8 } });
    const anxious = traitsOf({ ...average, bigFive: { ...average.bigFive, neuroticism: 0.8 } });
    expect(felt(bet(0.6, true), rude).anger).toBeGreaterThan(felt(bet(0.6, true), anxious).anger);
    expect(felt(bet(0.6, true), anxious).fear).toBeGreaterThan(felt(bet(0.6, true), rude).fear);
  });
});

describe('a new card', () => {
  const street = (previousEquity: number, equity: number): TableEvent => ({
    kind: 'street',
    equity,
    previousEquity,
    potBb: 6,
    investedBb: 3,
    stackBb: 97,
    streetsLeft: 2,
  });

  it('is not felt when her equity does not change', () => {
    expect(appraise(street(0.5, 0.5), noEmotions(), ctx(traitsOf(MALLORCA)))).toEqual([]);
  });

  it('is felt a little for a small change, with no threshold', () => {
    const small = felt(street(0.5, 0.55), traitsOf(MALLORCA));
    expect(small.joy).toBeGreaterThan(0);
    expect(small.joy).toBeLessThan(0.05);
  });

  it('settles the old expectation by the change and surprises by its size', () => {
    const a = axes(street(0.46, 0.85));
    expect(a.luck).toBe(1);
    expect(a.resolved).toBeCloseTo(0.39, 12);
    expect(a.expected).toBe(0.46);
    expect(a.unexpected).toBeCloseTo(1 - Math.exp(-3 * 0.24), 12);
    const flopped = felt(street(0.46, 0.85), traitsOf(MALLORCA));
    expect(flopped.joy).toBeGreaterThan(0.2);
    expect(flopped.surprise).toBeGreaterThan(0.4);
  });

  it('is unknown without the equity before it', () => {
    const first: TableEvent = { kind: 'street', equity: 0.6, potBb: 6, investedBb: 3 };
    expect(appraisalOf(first, ctx(traitsOf(MALLORCA)))).toBeNull();
  });
});

describe('the deal', () => {
  it('greets a premium starting hand with joy and junk with nothing', () => {
    const t = traitsOf(MALLORCA);
    const aces = felt({ kind: 'deal', equity: 0.85, potBb: 3, investedBb: 1.5 }, t);
    expect(aces.joy).toBeCloseTo(0.6 * t.gains.joy, 12);
    const trash = { kind: 'deal', equity: 0.35, potBb: 3, investedBb: 1.5 } as const;
    expect(appraise(trash, noEmotions(), ctx(t))).toEqual([]);
  });
});

describe('her own moves', () => {
  const t = traitsOf(MALLORCA);

  it('frightens her by what she risks when she bets behind a weak hand', () => {
    const bluff = { kind: 'ownMove', move: 'bet', amountBb: 20, equity: 0.3 } as const;
    const a = axes(bluff);
    expect(a.realized).toBe(false);
    expect(a.self).toBe(1);
    expect(a.value).toBeCloseTo(-0.5 * scaled(20) * 0.7, 12);
    expect(felt(bluff, t).fear).toBeGreaterThan(0.2);
    expect(felt(bluff, t).pride).toBe(0);
  });

  it('makes her a little proud when she takes the lead with a strong hand', () => {
    const value = { kind: 'ownMove', move: 'bet', amountBb: 20, equity: 0.85 } as const;
    const a = axes(value);
    expect(a.realized).toBe(true);
    expect(a.value).toBeCloseTo(0.2 * scaled(20) * smoothstep(0.7, 0.9, 0.85), 12);
    expect(felt(value, t).pride).toBeGreaterThan(0.05);
    expect(felt(value, t).fear).toBe(0);
  });

  it('leaves a small bet with a middling hand unfelt', () => {
    const plain = { kind: 'ownMove', move: 'bet', amountBb: 2, equity: 0.55 } as const;
    expect(appraise(plain, noEmotions(), ctx(t))).toEqual([]);
  });

  it('feels a fold of a hand she believed in as anger or distress by her coping', () => {
    const fold = { kind: 'ownMove', move: 'fold', facingBb: 20, equity: 0.7 } as const;
    expect(axes(fold).value).toBeCloseTo(-0.35 * scaled(20) * smoothstep(0.35, 0.75, 0.7), 12);
    const calm = felt(fold, stance(0.75));
    expect(calm.anger).toBeGreaterThan(calm.distress);
    const lost = felt(fold, stance(0.18));
    expect(lost.distress).toBeGreaterThan(lost.anger);
  });

  it('relieves the fear she holds when she folds junk', () => {
    const junk = { kind: 'ownMove', move: 'fold', facingBb: 20, equity: 0.1 } as const;
    expect(axes(junk).resolved).toBe(1);
    expect(felt(junk, t, { ...noEmotions(), fear: 0.5 }).relief).toBeCloseTo(
      0.5 * t.gains.relief,
      12,
    );
  });
});

describe('bluffs and mistakes', () => {
  it('makes a bluff that got through her own success and a caught one her shame', () => {
    const through = axes({ kind: 'bluff', succeeded: true, potBb: 20 });
    expect(through.value).toBeCloseTo(0.8 * scaled(20), 12);
    expect(through.self).toBe(1);
    const caught = felt({ kind: 'bluff', succeeded: false, potBb: 20 }, traitsOf(MALLORCA));
    expect(caught.shame).toBeGreaterThan(0.5);
  });

  it('weighs a mistake by its cost', () => {
    expect(axes({ kind: 'mistake', costBb: 10 }).value).toBeCloseTo(-scaled(10), 12);
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
      resolved: 0,
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
