import { describe, expect, it } from 'vitest';
import { mulberry32, parseCard } from '../cards/index.ts';
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

function deal(
  her: string,
  player: string,
  board: string,
  nowMs = 0,
  feeling = createFeeling({ seat: HER, rng: mulberry32(5) }),
): Hand {
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

const PAIRS = 1326;

function rangeOf(...hands: string[]): Float32Array {
  const weights = new Float32Array(PAIRS);
  for (const hand of hands) {
    const [a, b] = hand.split(' ').map(parseCard) as [number, number];
    const [lo, hi] = a < b ? [a, b] : [b, a];
    weights[(hi * (hi - 1)) / 2 + lo] = 1;
  }
  return weights;
}

const SETS_AND_TWO_PAIR = rangeOf('8c 8h', '8s 8h', '4c 4d', '4d 4h', 'Kd 8c', 'Ks 8s', 'Kd 4c');
const TOP_PAIRS = rangeOf('Ks Jd', 'Kd Th', 'Ks 9c', 'Kd Qs', 'Ks Jh');

function raisedOnTheFlop(her: string): Hand {
  const hand = deal(her, '7c 6c', 'Kc 8d 4s 2h 3c');
  hand.act(call, 1000);
  hand.act(check, 1500);
  hand.act(raiseTo(40), 2000);
  hand.act(raiseTo(120), 2500);
  return hand;
}

const equityOf = (hand: Hand): number => hand.feeling.snapshot().prospect?.equity ?? Number.NaN;

describe("her equity against the player's range", () => {
  it('drops on her top pair when his raise narrows him to strength', () => {
    const plain = raisedOnTheFlop('Kh Qd');
    const read = raisedOnTheFlop('Kh Qd');
    read.feeling.narrow(SETS_AND_TWO_PAIR, read.state());
    expect(equityOf(plain)).toBeGreaterThan(0.75);
    expect(equityOf(read)).toBeLessThan(0.3);
    const before = plain.feeling.snapshot().emotions;
    const after = read.feeling.snapshot().emotions;
    expect(after.disappointment).toBeGreaterThan(before.disappointment + 0.1);
    expect(after.surprise).toBeGreaterThan(before.surprise + 0.1);
    read.feeling.advance(5000);
    plain.feeling.advance(5000);
    expect(read.feeling.snapshot().emotions.fear).toBeGreaterThan(
      plain.feeling.snapshot().emotions.fear,
    );
  });

  it('stays high on her set when he is narrowed to top pairs', () => {
    const plain = raisedOnTheFlop('8h 8s');
    const read = raisedOnTheFlop('8h 8s');
    read.feeling.narrow(TOP_PAIRS, read.state());
    expect(equityOf(read)).toBeGreaterThan(0.85);
    const before = plain.feeling.snapshot().emotions;
    const after = read.feeling.snapshot().emotions;
    expect(after.disappointment).toBeLessThanOrEqual(before.disappointment + 0.01);
    expect(after.fear).toBeLessThanOrEqual(before.fear + 0.01);
  });

  it('ignores a range with no live pair', () => {
    const hand = raisedOnTheFlop('Kh Qd');
    const equity = equityOf(hand);
    hand.feeling.narrow(new Float32Array(PAIRS), hand.state());
    hand.feeling.narrow(rangeOf('Kh Kd', 'Qd 8d'), hand.state());
    expect(equityOf(hand)).toBe(equity);
  });

  it('ignores a range once the hand is over', () => {
    const hand = raisedOnTheFlop('Kh Qd');
    hand.act({ kind: 'fold' }, 3000);
    const before = hand.feeling.snapshot();
    hand.feeling.narrow(SETS_AND_TWO_PAIR, hand.state());
    expect(hand.feeling.snapshot()).toEqual(before);
  });

  it('starts the next hand against a random hand', () => {
    const onTheTurn = (feeling: Feeling) => {
      const hand = deal('Kh Qd', '7c 6c', 'Kc 8d 4s 2h 3c', 4000, feeling);
      for (const action of [call, check, check, check]) hand.act(action, 5000);
      return equityOf(hand);
    };
    const narrowed = raisedOnTheFlop('Kh Qd');
    narrowed.feeling.narrow(SETS_AND_TWO_PAIR, narrowed.state());
    narrowed.act({ kind: 'fold' }, 3000);
    const plain = raisedOnTheFlop('Kh Qd');
    plain.act({ kind: 'fold' }, 3000);
    expect(onTheTurn(narrowed.feeling)).toBe(onTheTurn(plain.feeling));
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
