import { describe, expect, it } from 'vitest';
import { checkDecision } from './checks.ts';
import type { Shares } from './checks.ts';

const NEUTRAL = { aggression: 1, bluff: 1, tightness: 1, sizing: 1, stickiness: 1 };

const facing = (over: Partial<Shares> = {}): Shares => ({
  classes: ['fold', 'passive', 'raise', 'allIn'],
  street: 1,
  base: [0.4, 0.4, 0.15, 0.05],
  styled: [0.3, 0.5, 0.15, 0.05],
  only: {
    aggression: [0.4, 0.45, 0.11, 0.04],
    bluff: [0.4, 0.4, 0.15, 0.05],
    tightness: [0.4, 0.4, 0.15, 0.05],
    sizing: [0.4, 0.4, 0.15, 0.05],
    stickiness: [0.3, 0.46, 0.18, 0.06],
  },
  foldAxes: [0.3, 0.46, 0.18, 0.06],
  played: 1,
  ...over,
});

const texts = (shares: Shares, style = { ...NEUTRAL, stickiness: 1.44, aggression: 0.78 }) =>
  checkDecision(shares, style).map((f) => `${f.level} ${f.rule}`);

describe('checkDecision', () => {
  it('passes a decision that follows every rule', () => {
    expect(texts(facing())).toEqual([]);
  });

  it('flags a fold axis that moves the fold the wrong way', () => {
    const wrong = facing({
      only: { ...facing().only, stickiness: [0.5, 0.35, 0.1, 0.05] },
      foldAxes: [0.5, 0.35, 0.1, 0.05],
      styled: [0.5, 0.4, 0.07, 0.03],
    });
    expect(texts(wrong)).toContain('error fold-direction');
  });

  it('flags a fold share that the other axes moved', () => {
    expect(texts(facing({ styled: [0.35, 0.45, 0.15, 0.05] }))).toContain('error fold-kept');
  });

  it('flags aggression that moves the bets the wrong way where she can check', () => {
    const open: Shares = {
      ...facing(),
      classes: ['passive', 'raise', 'raise'],
      base: [0.5, 0.3, 0.2],
      styled: [0.4, 0.35, 0.25],
      only: {
        ...facing().only,
        aggression: [0.4, 0.35, 0.25],
        bluff: [0.5, 0.3, 0.2],
        sizing: [0.5, 0.3, 0.2],
      },
      foldAxes: [0.5, 0.3, 0.2],
      played: 0,
    };
    expect(texts(open, { ...NEUTRAL, aggression: 0.7 })).toContain('error aggression-direction');
    expect(texts(open, { ...NEUTRAL, aggression: 1.3 })).not.toContain(
      'error aggression-direction',
    );
  });

  it('flags sizing that changes anything but the split between sizes', () => {
    const sized = facing({ only: { ...facing().only, sizing: [0.4, 0.38, 0.17, 0.05] } });
    expect(texts(sized, { ...NEUTRAL, sizing: 1.5 })).toContain('error sizing-total');
  });

  it('flags bluff that acts while she faces a bet', () => {
    const bluffed = facing({ only: { ...facing().only, bluff: [0.4, 0.3, 0.25, 0.05] } });
    expect(texts(bluffed, { ...NEUTRAL, bluff: 1.5 })).toContain('error bluff-facing');
  });

  it('notes an unlikely choice and a large move', () => {
    const notes = texts(facing({ styled: [0.3, 0.5, 0.18, 0.02], played: 3 }));
    expect(notes).toContain('note unlikely-choice');
    const moved = facing({
      styled: [0.05, 0.75, 0.15, 0.05],
      only: { ...facing().only, stickiness: [0.05, 0.7, 0.2, 0.05] },
      foldAxes: [0.05, 0.75, 0.15, 0.05],
    });
    expect(texts(moved)).toContain('note large-move');
  });
});
