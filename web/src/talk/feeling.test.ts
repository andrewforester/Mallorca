import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../cards/index.ts';
import { applyAction } from '../engine/hand.ts';
import { call, check, deckOf, raiseTo, startHand } from '../engine/testDeck.ts';
import type { Action, Step } from '../engine/types.ts';
import { createFeeling } from './feeling.ts';
import type { Feeling } from './feeling.ts';
import { NO_HAND, track } from './handTracker.ts';
import type { HandState } from './handTracker.ts';

const HER = 1;

interface Hand {
  feeling: Feeling;
  state(): HandState;
  act(action: Action, nowMs?: number): void;
}

function deal(her: string, player: string, board: string, nowMs = 0): Hand {
  const feeling = createFeeling({ seat: HER, rng: mulberry32(5) });
  let hand = NO_HAND;
  let step: Step = startHand([2000, 2000], deckOf(her, player, board), 0);
  const see = (s: Step, now: number) => {
    feeling.advance(now);
    for (const event of s.events) {
      hand = track(hand, event, HER);
      feeling.see(event, hand);
    }
  };
  see(step, nowMs);
  return {
    feeling,
    state: () => hand,
    act(action, now = nowMs) {
      step = applyAction(step.hand, step.seats, action);
      see(step, now);
    },
  };
}

describe('the feeling of a hand', () => {
  it('turns a bad beat into injustice, distress and overload', () => {
    const hand = deal('As Ah', 'Js Ts', 'Kc 9d 2s 3h Qh');
    hand.act(raiseTo(60), 1000);
    hand.act(raiseTo(2000), 2000);
    hand.act(call, 3000);
    hand.feeling.advance(4000);
    const s = hand.feeling.snapshot();
    expect(s.sessionNetBb).toBe(-100);
    expect(s.emotions.injustice).toBeGreaterThan(0.3);
    expect(s.emotions.distress).toBeGreaterThan(0.5);
    expect(s.load.overload).toBeGreaterThan(0.5);
  });

  it('takes a raise over her bet as a challenge and remembers the pressure', () => {
    const hand = deal('Kh Qd', '7c 6c', 'Kc 8d 4s 2h 3c');
    hand.act(call, 1000);
    hand.act(check, 1500);
    hand.act(raiseTo(40), 2000);
    const before = hand.feeling.snapshot().emotions.anger;
    hand.act(raiseTo(120), 2500);
    const after = hand.feeling.snapshot();
    expect(after.emotions.anger).toBeGreaterThan(before + 0.05);
    expect(after.pressure).toBeGreaterThan(0.9);
  });

  it('hears a mocking line as anger', () => {
    const hand = deal('7c 2d', 'Ah Kd', 'Qs Jh 8d 4c 9h');
    hand.feeling.hear(['mockBluff']);
    expect(hand.feeling.snapshot().emotions.anger).toBeGreaterThan(0.2);
  });

  it('moves time only forward with the clock it is given', () => {
    const hand = deal('7c 2d', 'Ah Kd', 'Qs Jh 8d 4c 9h', 10_000);
    hand.feeling.advance(13_000);
    expect(hand.feeling.snapshot().time).toBeCloseTo(3);
    hand.feeling.advance(12_000);
    expect(hand.feeling.snapshot().time).toBeCloseTo(3);
  });
});

describe('what the feeling gives the rest of talk', () => {
  it('is calm at the start: no words, speaking factor one, neutral style', () => {
    const feeling = createFeeling({ seat: HER, rng: mulberry32(1) });
    expect(feeling.words()).toEqual([]);
    expect(feeling.speakFactor()).toBeCloseTo(1, 1);
    expect(feeling.style()).toEqual({
      aggression: 1,
      bluff: 1,
      tightness: 1,
      sizing: 1,
      stickiness: 1,
    });
  });

  it('names the strongest emotions for the prompt, at most three', () => {
    const hand = deal('As Ah', 'Js Ts', 'Kc 9d 2s 3h Qh');
    hand.act(raiseTo(60), 1000);
    hand.act(raiseTo(2000), 2000);
    hand.act(call, 3000);
    hand.feeling.advance(6000);
    const words = hand.feeling.words();
    expect(words.length).toBeGreaterThan(0);
    expect(words.length).toBeLessThanOrEqual(3);
    expect(words).toContain('feeling robbed');
  });

  it('plays the overload into the style through the tightness of the bot', () => {
    const hand = deal('As Ah', 'Js Ts', 'Kc 9d 2s 3h Qh');
    hand.act(raiseTo(60), 1000);
    hand.act(raiseTo(2000), 2000);
    hand.act(call, 3000);
    hand.feeling.advance(8000);
    const style = hand.feeling.style();
    expect(style.tightness).toBeLessThan(1);
    expect(style.stickiness).toBeGreaterThan(1);
    expect(style.tightness * hand.feeling.snapshot().style.looseness).toBeCloseTo(1, 12);
  });
});
