import { PROFILES } from '../profiles.ts';
import { describe, expect, it } from 'vitest';
import { ANCHORS, blendOf, faceOf } from './anchors.ts';
import { maskOf, pulsesFor, shownPadOf } from './expression.ts';
import { visemesOf } from './visemes.ts';
import { prosodyOf } from '../voice/prosody.ts';

describe('expression space', () => {
  it('is neutral at the origin and sums the anchor weights to one', () => {
    const mix = blendOf([0, 0, 0]);
    expect(mix.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(mix[0]).toBeGreaterThan(0.9);
  });

  it('moves from a warm smile to joy as valence and arousal grow', () => {
    const index = (id: string) => ANCHORS.findIndex((a) => a.id === id);
    const mild = blendOf([0.45, -0.1, 0.1]);
    const strong = blendOf([0.85, 0.5, 0.3]);
    expect(mild[index('content')]!).toBeGreaterThan(mild[index('joy')]!);
    expect(strong[index('joy')]!).toBeGreaterThan(strong[index('content')]!);
  });

  it('scales a face by the look of the profile', () => {
    const mix = blendOf([-0.65, 0.8, 0.65]);
    const ingrid = faceOf(mix, PROFILES.ingrid.face, 1);
    const lola = faceOf(mix, PROFILES.lola.face, 1);
    expect(ingrid.browDownLeft!).toBeGreaterThan(lola.browDownLeft!);
    expect(ingrid.mouthPressLeft!).toBeLessThan(lola.mouthPressLeft!);
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

  it('turns a masked reaction into a short leak and a control pulse', () => {
    const open = pulsesFor([{ emotion: 'surprise', amount: 0.8, reason: '' }], 0.1, 1);
    const masked = pulsesFor([{ emotion: 'surprise', amount: 0.8, reason: '' }], 0.95, 1);
    const total = (p: (typeof open)[number]) => p.attack + p.hold + p.release;
    expect(total(open[0]!)).toBeGreaterThan(1.5);
    expect(total(masked[0]!)).toBeLessThan(0.35);
    expect(masked.some((p) => p.face === 'control')).toBe(true);
  });
});

describe('speech', () => {
  it('maps letters to visemes at the given pace', () => {
    const cues = visemesOf('Pot.', 10);
    expect(cues.map((c) => c.viseme)).toEqual(['PP', 'O', 'DD']);
    expect(cues[1]!.at - cues[0]!.at).toBeCloseTo(0.1);
  });

  it('speaks faster and higher when aroused, slower when sad', () => {
    const angry = prosodyOf([-0.5, 0.7, 0.5], 0.5, 0);
    const sad = prosodyOf([-0.6, -0.4, -0.4], 0, 0.8);
    expect(angry.rate).toBeGreaterThan(1);
    expect(angry.pitch).toBeGreaterThan(sad.pitch);
    expect(sad.rate).toBeLessThan(1);
  });
});
