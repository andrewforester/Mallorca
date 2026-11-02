import { describe, expect, it } from 'vitest';
import type { Rng } from '../cards/index.ts';
import { MALLORCA, createEngine } from '../emotion/index.ts';
import type { BigFive, Emotion, Pad, Snapshot } from '../emotion/index.ts';
import { NO_HAND } from '../persona/hand.ts';
import {
  ACT_STYLES,
  COOL_LINES,
  HUMOUR_STYLES,
  JOKE_BASE,
  drawHumour,
  jokeChance,
  stateOf,
  tendencyOf,
} from './humour.ts';
import type { HumourStyle } from './humour.ts';
import type { Act, Occasion, OccasionKind } from './types.ts';

const NEUTRAL: BigFive = {
  openness: 0,
  conscientiousness: 0,
  extraversion: 0,
  agreeableness: 0,
  neuroticism: 0,
};

function snapshot(
  emotions: Partial<Record<Emotion, number>> = {},
  mood: Pad = [0, 0, 0],
  overload = 0,
): Snapshot {
  const base = createEngine(MALLORCA).snapshot();
  const zero = Object.fromEntries(Object.keys(base.emotions).map((e) => [e, 0]));
  return {
    ...base,
    emotions: { ...base.emotions, ...zero, ...emotions },
    mood,
    load: { ...base.load, overload },
  };
}

const rolls = (...values: number[]): Rng => {
  let k = 0;
  return { next: () => values[k++] ?? 0 };
};

function occasion(kind: OccasionKind, end: Occasion['end'] = null): Occasion {
  return {
    kind,
    end,
    impulses: [],
    journalIds: [],
    handNumber: 1,
    street: 'flop',
    actionStreet: 'flop',
    strength: 'medium',
    endsHand: false,
    hand: NO_HAND,
    text: null,
    previous: null,
  };
}

const draw = (act: Act, kind: OccasionKind, bigFive: BigFive, rng: Rng, s = snapshot()) =>
  drawHumour(
    { act, occasion: occasion(kind), bigFive, snapshot: s, linesSinceJoke: COOL_LINES },
    rng,
  );

describe('humour', () => {
  it('weighs her traits by the meta-analysis', () => {
    const t = tendencyOf(MALLORCA.bigFive);
    const {
      openness: o,
      conscientiousness: c,
      extraversion: e,
      agreeableness: a,
      neuroticism: n,
    } = MALLORCA.bigFive;
    const of = (w: [number, number, number, number, number]) =>
      0.5 + 0.2 * 2 * (w[0] * e + w[1] * a + w[2] * c + w[3] * n + w[4] * o);
    expect(t.affiliative).toBeCloseTo(of([0.46, 0.14, 0.04, -0.08, 0.26]), 9);
    expect(t.selfEnhancing).toBeCloseTo(of([0.33, 0.2, 0.1, -0.22, 0.24]), 9);
    expect(t.aggressive).toBeCloseTo(of([0.08, -0.38, -0.26, 0.06, -0.05]), 9);
    expect(t.selfDefeating).toBeCloseTo(of([-0.02, -0.07, -0.22, 0.19, -0.01]), 9);
  });

  it('makes a disagreeable, careless persona more sarcastic than warm', () => {
    const t = tendencyOf({ ...NEUTRAL, agreeableness: -1, conscientiousness: -0.5 });
    expect(t.aggressive).toBeGreaterThan(t.affiliative);
  });

  it('keeps every tendency in [0, 1]', () => {
    const corner = {
      openness: 1,
      conscientiousness: -1,
      extraversion: 1,
      agreeableness: -1,
      neuroticism: 1,
    };
    for (const style of HUMOUR_STYLES) {
      expect(tendencyOf(corner)[style]).toBeGreaterThanOrEqual(0);
      expect(tendencyOf(corner)[style]).toBeLessThanOrEqual(1);
    }
  });

  it('sharpens with anger and softens with fear', () => {
    const calm = stateOf(snapshot(), NEUTRAL).aggressive;
    expect(stateOf(snapshot({ anger: 0.5 }), NEUTRAL).aggressive).toBeCloseTo(
      calm * Math.exp(0.5),
      9,
    );
    expect(stateOf(snapshot({ fear: 0.5 }), NEUTRAL).aggressive).toBeLessThan(calm);
  });

  it('keeps every state multiplier in [0.3, 3]', () => {
    const wild = snapshot(
      { anger: 1, injustice: 1, pride: 1, joy: 1, relief: 1, hope: 1 },
      [1, 1, 1],
    );
    const low = snapshot({ fear: 1, distress: 1, shame: 1, anger: 1 }, [-1, 0, -1]);
    for (const s of [wild, low]) {
      for (const style of HUMOUR_STYLES) {
        const v = stateOf(s, NEUTRAL)[style];
        expect(v).toBeGreaterThanOrEqual(0.3);
        expect(v).toBeLessThanOrEqual(3);
      }
    }
  });

  it('gives the chance of a joke from her nature and her state', () => {
    const calm = jokeChance(MALLORCA.bigFive, snapshot(), COOL_LINES, 'react');
    expect(calm).toBeCloseTo(JOKE_BASE * (1 + 0.92 * MALLORCA.bigFive.extraversion), 12);
    expect(jokeChance(MALLORCA.bigFive, snapshot({}, [0, 0, 0], 1), COOL_LINES, 'react')).toBe(0);
    expect(jokeChance(MALLORCA.bigFive, snapshot(), COOL_LINES - 1, 'react')).toBeCloseTo(
      calm * 0.3,
      12,
    );
    expect(jokeChance(MALLORCA.bigFive, snapshot(), COOL_LINES, 'answer')).toBeCloseTo(
      calm * 0.5,
      12,
    );
  });

  it('draws no joke above the chance', () => {
    const { draw: d, humour } = draw('react', 'card', MALLORCA.bigFive, rolls(0.99));
    expect(humour).toBeNull();
    expect(d.style).toBeNull();
    expect(d.styleRoll).toBeNull();
    expect(d.roll).toBe(0.99);
  });

  it('draws only a style the act allows', () => {
    for (const styleRoll of [0, 0.3, 0.6, 0.99]) {
      const { humour } = draw('concede', 'handEnded', MALLORCA.bigFive, rolls(0, styleRoll));
      expect(ACT_STYLES.concede).toContain(humour?.style);
    }
  });

  it('aims a self style at herself, an aggressive one at his play', () => {
    const style = (s: HumourStyle, kind: OccasionKind, end: Occasion['end'] = null) =>
      drawHumour(
        {
          act: 'deflect',
          occasion: occasion(kind, end),
          bigFive: NEUTRAL,
          snapshot: snapshot(),
          linesSinceJoke: COOL_LINES,
        },
        rolls(0, (HUMOUR_STYLES.indexOf(s) + 0.5) / 4),
      ).humour;
    expect(style('selfEnhancing', 'card')?.target).toBe('self');
    expect(style('selfDefeating', 'card')?.target).toBe('self');
    expect(style('aggressive', 'card')?.target).toBe('play');
    expect(style('affiliative', 'playerRaise')?.target).toBe('play');
    expect(style('affiliative', 'handEnded', 'playerBluffShown')?.target).toBe('play');
    expect(style('affiliative', 'card')?.target).toBe('situation');
  });

  it('grades its intensity and softens a jab of an agreeable persona', () => {
    const jab = (agreeableness: number, s: Snapshot) =>
      draw('tease', 'card', { ...NEUTRAL, agreeableness }, rolls(0, 0.999), s).humour;
    expect(jab(0.01, snapshot())?.softened).toBe(true);
    expect(jab(0, snapshot())?.softened).toBe(false);
    expect(jab(0, snapshot())?.intensity).toBe('soft');
    expect(jab(-1, snapshot({ anger: 0.5 }))?.intensity).toBe('clear');
    expect(jab(-1, snapshot({ anger: 1 }))?.intensity).toBe('sharp');
    const warm = draw('enjoy', 'card', NEUTRAL, rolls(0, 0), snapshot()).humour;
    expect(warm?.style).toBe('affiliative');
    expect(warm?.softened).toBe(false);
  });
});
