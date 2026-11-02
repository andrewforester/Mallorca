import { describe, expect, it } from 'vitest';
import { MALLORCA, createEngine } from '../emotion/index.ts';
import type { Impulse, Personality, Snapshot } from '../emotion/index.ts';
import { ANCHORS, blendOf, faceOf } from './anchors.ts';
import { maskOf, pulsesFor, pulsesOf, shownPadOf } from './expression.ts';
import { faceFrame } from './frame.ts';
import { MALLORCA_LOOK } from './look.ts';
import type { FaceLook } from './look.ts';
import { prosodyOf, speechOf } from './prosody.ts';
import { STANCES } from './stance.ts';
import { visemesOf } from './visemes.ts';

const COLD: Personality = {
  bigFive: {
    openness: -0.2,
    conscientiousness: 0.7,
    extraversion: -0.5,
    agreeableness: -0.2,
    neuroticism: -0.6,
  },
  suppression: 0.9,
  experience: 0.9,
};

const HOT: Personality = {
  bigFive: {
    openness: 0.6,
    conscientiousness: -0.4,
    extraversion: 0.8,
    agreeableness: 0.3,
    neuroticism: 0.7,
  },
  suppression: 0.05,
  experience: 0.3,
};

const LOUD: FaceLook = { ...MALLORCA_LOOK, mouth: 1.35, leak: 1.35 };
const index = (id: string) => ANCHORS.findIndex((a) => a.id === id);
const total = (face: Record<string, number>) => Object.values(face).reduce((a, b) => a + b, 0);

function badBeat(personality: Personality): Snapshot {
  const engine = createEngine(personality);
  const money = { potBb: 60, investedBb: 30, stackBb: 70, streetsLeft: 0 };
  engine.event({ kind: 'deal', equity: 0.8, ...money, streetsLeft: 3 });
  engine.event({ kind: 'street', equity: 0.95, ...money, streetsLeft: 1 });
  engine.event({ kind: 'street', equity: 0, ...money });
  engine.event({ kind: 'result', netBb: -30, lastEquity: 0.95 });
  engine.step(1);
  return engine.snapshot();
}

describe('expression space', () => {
  it('is neutral at the origin and sums the anchor weights to one', () => {
    const mix = blendOf([0, 0, 0]);
    expect(mix.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(mix[0]).toBeGreaterThan(0.9);
  });

  it('moves from a warm smile to joy as valence and arousal grow', () => {
    const mild = blendOf([0.45, -0.1, 0.1]);
    const strong = blendOf([0.85, 0.5, 0.3]);
    expect(mild[index('content')]!).toBeGreaterThan(mild[index('joy')]!);
    expect(strong[index('joy')]!).toBeGreaterThan(strong[index('content')]!);
  });

  it('scales a face by the look and the expressiveness', () => {
    const mix = blendOf([-0.65, 0.8, 0.65]);
    const calm = faceOf(mix, MALLORCA_LOOK, 0.5);
    const loud = faceOf(mix, LOUD, 0.5);
    expect(loud.mouthPressLeft!).toBeGreaterThan(calm.mouthPressLeft!);
    expect(faceOf(mix, MALLORCA_LOOK, 1).browDownLeft!).toBeCloseTo(2 * calm.browDownLeft!);
  });
});

describe('poker face', () => {
  it('adds effort to the habit and loses the mask under overload', () => {
    expect(maskOf(0.3, 0, 0)).toBeCloseTo(0.3);
    expect(maskOf(0.3, 1, 0)).toBeCloseTo(1);
    expect(maskOf(0.8, 0, 1)).toBeCloseTo(0.8 * 0.4);
  });

  it('shows the acted state in place of the felt one behind a full mask', () => {
    expect(shownPadOf([-0.5, 0.5, -0.5], 1, [0.2, 0, 0.6])).toEqual([0.2, 0, 0.6]);
  });

  it('acts confident on a bluff and flat on a hidden strong hand', () => {
    expect(STANCES.bluff).toEqual([0.2, 0, 0.6]);
    expect(STANCES.hide).toBeNull();
  });

  it('hides as much as the effort of what she presents asks', () => {
    const s = createEngine(MALLORCA).snapshot();
    const frame = faceFrame(s, { stance: 'hide', effort: 0.5 }, MALLORCA_LOOK);
    expect(frame.mask).toBeCloseTo(maskOf(s.traits.mask, 0.5, s.load.overload), 12);
    expect(frame.shown).toEqual(faceFrame(s, { stance: 'hide', effort: 0.5 }, MALLORCA_LOOK).shown);
  });

  it('turns a masked reaction into a short leak and a control pulse', () => {
    const surprise: Impulse[] = [{ emotion: 'surprise', amount: 0.8, reason: '' }];
    const open = pulsesFor(surprise, 0.1, 1);
    const masked = pulsesFor(surprise, 0.95, 1);
    const length = (p: (typeof open)[number]) => p.attack + p.hold + p.release;
    expect(length(open[0]!)).toBeGreaterThan(1.5);
    expect(length(masked[0]!)).toBeLessThan(0.35);
    expect(masked.some((p) => p.face === 'control')).toBe(true);
  });

  it('resolves pulses into weights and blinks the control pulse twice', () => {
    const joy: Impulse[] = [{ emotion: 'joy', amount: 0.6, reason: '' }];
    const pulses = pulsesOf(joy, 0.95, MALLORCA_LOOK);
    expect(pulses[0]!.weights.mouthSmileLeft).toBeGreaterThan(0);
    expect(pulses[0]!.blinks).toBe(0);
    expect(pulses.at(-1)!.blinks).toBe(2);
    expect(pulses.at(-1)!.delay).toBeCloseTo(0.3);
  });

  it('ignores impulses below the threshold', () => {
    expect(pulsesOf([{ emotion: 'fear', amount: 0.05, reason: '' }], 0.2, MALLORCA_LOOK)).toEqual(
      [],
    );
  });
});

describe('frame', () => {
  it('is calm and neutral without feelings', () => {
    const frame = faceFrame(createEngine(MALLORCA).snapshot(), null, MALLORCA_LOOK);
    expect(frame.idle.nervous).toBeCloseTo(0);
    expect(total(frame.weights)).toBeLessThan(0.5);
    expect(frame.idle.blinkRate).toBe(MALLORCA_LOOK.blink);
  });

  it('shows a bad beat on a hot temperament and barely on a cold one', () => {
    const hot = faceFrame(badBeat(HOT), null, LOUD);
    const cold = faceFrame(badBeat(COLD), null, MALLORCA_LOOK);
    expect(hot.shown[0]).toBeLessThan(-0.2);
    expect(Math.abs(cold.shown[0])).toBeLessThan(Math.abs(hot.shown[0]) / 2);
    expect(cold.mask).toBeGreaterThan(hot.mask);
  });

  it('keeps nervousness from the felt state behind a bluffing face', () => {
    const engine = createEngine(MALLORCA);
    const money = { potBb: 40, investedBb: 20, stackBb: 80, streetsLeft: 1 };
    engine.event({ kind: 'deal', equity: 0.3, ...money, streetsLeft: 3 });
    engine.event({ kind: 'opponentBet', sizeBb: 40, equity: 0.1, raise: true });
    engine.step(0.5);
    const open = faceFrame(engine.snapshot(), null, MALLORCA_LOOK);
    const acting = faceFrame(engine.snapshot(), { stance: 'bluff', effort: 0.6 }, MALLORCA_LOOK);
    expect(acting.mask).toBeGreaterThan(open.mask);
    expect(acting.shown[2]).toBeGreaterThan(open.shown[2]);
    expect(acting.idle.nervous).toBeCloseTo(open.idle.nervous);
    expect(acting.idle.nervous).toBeGreaterThan(0.1);
  });
});

describe('speech', () => {
  it('maps letters to visemes at the given pace', () => {
    const cues = visemesOf('Pot.', 10);
    expect(cues.map((c) => c.viseme)).toEqual(['PP', 'O', 'DD']);
    expect(cues[1]!.at - cues[0]!.at).toBeCloseTo(0.1);
  });

  it('speaks her lines at her pace times the rate', () => {
    const slow = speechOf('Nice hand', { rate: 0.8, pitch: 1, volume: 1 });
    const fast = speechOf('Nice hand', { rate: 1.2, pitch: 1, volume: 1 });
    expect(slow.at(-1)!.at).toBeGreaterThan(fast.at(-1)!.at);
    expect(slow.map((c) => c.viseme)).toEqual(visemesOf('Nice hand', 1).map((c) => c.viseme));
  });

  it('speaks faster and higher when aroused, slower when sad', () => {
    const angry = prosodyOf([-0.5, 0.7, 0.5], 0.5, 0);
    const sad = prosodyOf([-0.6, -0.4, -0.4], 0, 0.8);
    expect(angry.rate).toBeGreaterThan(1);
    expect(angry.pitch).toBeGreaterThan(sad.pitch);
    expect(sad.rate).toBeLessThan(1);
  });
});
