import { describe, expect, it } from 'vitest';
import { fullDeck, mulberry32, parseCards, shuffle } from '../cards/index.ts';
import { applyAction } from '../engine/hand.ts';
import { call, check, deckOf, fold, raiseTo, startHand } from '../engine/testDeck.ts';
import type { Action, Step } from '../engine/types.ts';
import { BASE_HABITS, habitsAt } from './habits.ts';
import type { Habits, Situation } from './habits.ts';
import { CALM, afterHand } from './mood.ts';
import type { StrengthClass } from './strength.ts';
import { createTalk, drawLine } from './talk.ts';
import type { LineIntent, Talk } from './talk.ts';

const always = (): Habits => {
  const row = {
    strong: { speak: 1, honest: 1 },
    medium: { speak: 1, honest: 1 },
    weak: { speak: 1, honest: 1 },
  };
  const situations = Object.keys(BASE_HABITS) as Situation[];
  return Object.fromEntries(situations.map((s) => [s, row])) as Habits;
};

interface Table {
  talk: Talk;
  begin(her: string, player: string, board: string, nowMs?: number): LineIntent | null;
  act(action: Action, nowMs?: number): LineIntent | null;
}

function table(talk: Talk, stacks: [number, number] = [2000, 2000]): Table {
  let step: Step | null = null;
  return {
    talk,
    begin(her, player, board, nowMs = 0) {
      step = startHand(stacks, deckOf(her, player, board), 0);
      return talk.observe(step.events, nowMs);
    },
    act(action, nowMs = 0) {
      const current = step as Step;
      step = applyAction(current.hand, current.seats, action);
      return talk.observe(step.events, nowMs);
    },
  };
}

const chatty = (): Table =>
  table(createTalk({ seat: 1, rng: mulberry32(3), level: 'obvious', habits: always() }));

describe('observe', () => {
  it('yields herBet on her raise with the spot of the event', () => {
    const t = chatty();
    expect(t.begin('7c 2d', 'Ah Kd', 'Qs Jh 8d 4c 9h')).toBeNull();
    expect(t.act(call)).toBeNull();
    const intent = t.act(raiseTo(60), 2000);
    expect(intent).toEqual({
      situation: 'herBet',
      hint: intent?.hint === null ? null : 'weak',
      honest: true,
      strength: 'weak',
      street: 'preflop',
      handNumber: 1,
    });
  });

  it('yields playerBet on his raise and herCall on her check or call, one per street', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h');
    expect(t.act(raiseTo(60), 0)?.situation).toBe('playerBet');
    expect(t.act(call, 5000)).toBeNull();
    const herCheck = t.act(check, 10000);
    expect(herCheck?.situation).toBe('herCall');
    expect(herCheck?.street).toBe('flop');
    expect(t.act(raiseTo(40), 15000)).toBeNull();
    expect(t.act(call, 20000)).toBeNull();
    const herCall = t.act(check, 25000);
    expect(herCall?.situation).toBe('herCall');
    expect(herCall?.street).toBe('turn');
  });

  it('allows one unprompted line per street and none within 1500 ms', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h', 0);
    expect(t.act(raiseTo(60), 0)?.situation).toBe('playerBet');
    expect(t.act(raiseTo(180), 5000)).toBeNull();
    expect(t.act(call, 5000)).toBeNull();
    expect(t.act(raiseTo(100), 5100)?.street).toBe('flop');
    expect(t.act(call, 5200)).toBeNull();
    expect(t.act(raiseTo(200), 6000)).toBeNull();
    const late = t.act(raiseTo(600), 7000);
    expect(late?.situation).toBe('playerBet');
    expect(late?.street).toBe('turn');
  });

  it('lets a line on a call that closes the street take the next street slot', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h', 0);
    expect(t.act(call, 0)).toBeNull();
    const closing = t.act(check, 2000);
    expect(closing?.situation).toBe('herCall');
    expect(closing?.street).toBe('flop');
    expect(t.act(check, 5000)).toBeNull();
  });

  it('answers a new hand with herCall, not the end of the previous hand', () => {
    const t = chatty();
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    t.act(raiseTo(60), 0);
    expect(t.act(fold, 2000)?.situation).toBe('handLost');
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd', 4000);
    expect(t.talk.replyIntent().situation).toBe('herCall');
  });

  it('upgrades a lost showdown after her river bet with a weak hand to bluffCaught', () => {
    const t = chatty();
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    for (const [i, action] of [call, check, check, check, check, check].entries()) {
      t.act(action, 1000 * (i + 1) * 2);
    }
    t.act(raiseTo(40), 20000);
    const end = t.act(call, 40000);
    expect(end?.situation).toBe('bluffCaught');
    expect(end?.hint).toBeNull();
    expect(t.talk.mood()).toEqual(afterHand(CALM, { netBb: -3, luckBb: null, bluffCaught: true }));
  });

  it('says handLost without a bluff when she only checked and lost', () => {
    const t = chatty();
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    let end: LineIntent | null = null;
    for (const [i, action] of [call, check, check, check, check, check, check, check].entries()) {
      end = t.act(action, 2000 * (i + 1));
    }
    expect(end?.situation).toBe('handLost');
    expect(end?.street).toBe('complete');
  });
});

describe('outcomes', () => {
  it('applies a preflop fold to the mood without luck', () => {
    const t = chatty();
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    t.act(raiseTo(60), 0);
    expect(t.act(fold, 2000)?.situation).toBe('handLost');
    expect(t.talk.mood()).toEqual(afterHand(CALM, { netBb: -1, luckBb: null, bluffCaught: false }));
  });

  it('counts a split pot as won and keeps luck out', () => {
    const t = chatty();
    t.begin('2c 3d', '4c 5d', 'As Ks Qs Js Ts');
    t.act(raiseTo(100), 0);
    t.act(call, 2000);
    let end: LineIntent | null = null;
    for (let i = 0; i < 6; i++) {
      end = t.act(check, 4000 + 2000 * i);
    }
    expect(end?.situation).toBe('handWon');
    expect(t.talk.mood()).toEqual(afterHand(CALM, { netBb: 0, luckBb: null, bluffCaught: false }));
  });

  it('measures luck in an all-in runout and tilts her after a bad beat', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', '7h 7d 2s 3c 4c');
    t.act(raiseTo(2000), 0);
    const end = t.act(call, 2000);
    expect(end?.situation).toBe('handLost');
    expect(t.talk.mood()).toEqual(
      afterHand(CALM, { netBb: -100, luckBb: -100, bluffCaught: false }),
    );
    expect(t.talk.mood().tilt).toBeCloseTo(0.3, 12);
  });

  it('keeps luck out of a big loss when the money went in on the river', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', '7h 7d 2s 3c 4c');
    for (const action of [call, check, check, check, check, check, check]) {
      t.act(action, 0);
    }
    t.act(raiseTo(1980), 0);
    t.act(call, 0);
    expect(t.talk.mood()).toEqual(
      afterHand(CALM, { netBb: -100, luckBb: null, bluffCaught: false }),
    );
    expect(t.talk.mood().tilt).toBe(0);
  });
});

describe('reproducibility', () => {
  const play = (gap: number) => {
    const talk = createTalk({ seat: 1, rng: mulberry32(9), level: 'obvious' });
    const decks = mulberry32(2);
    let now = 0;
    for (let i = 0; i < 30; i++) {
      let step = startHand([2000, 2000], shuffle(fullDeck(), decks), 0);
      talk.observe(step.events, (now += gap));
      step = applyAction(step.hand, step.seats, raiseTo(2000));
      talk.observe(step.events, (now += gap));
      step = applyAction(step.hand, step.seats, call);
      talk.observe(step.events, (now += gap));
    }
    return { mood: talk.mood(), style: talk.style() };
  };

  it('keeps the same mood and style for a seed whatever the pacing of lines', () => {
    expect(play(10_000)).toEqual(play(0));
  });
});

describe('drawLine', () => {
  const spots = (habits: Habits, strength: StrengthClass, count: number, seed: number) => {
    const rng = mulberry32(seed);
    const draws = [];
    for (let i = 0; i < count; i++) {
      draws.push(drawLine({ habits, situation: 'herBet', strength, mood: CALM }, rng));
    }
    return draws;
  };

  it('speaks 0.6 and tells the truth 0.2 after a weak bet on obvious', () => {
    const draws = spots(habitsAt(BASE_HABITS, 'obvious'), 'weak', 5000, 11);
    const spoken = draws.filter((d) => d.speak);
    expect(spoken.length / draws.length).toBeGreaterThan(0.57);
    expect(spoken.length / draws.length).toBeLessThan(0.63);
    const honest = spoken.filter((d) => d.honest).length / spoken.length;
    expect(honest).toBeGreaterThan(0.17);
    expect(honest).toBeLessThan(0.23);
    const hinted = spoken.filter((d) => d.hint !== null);
    expect(hinted.length / spoken.length).toBeGreaterThan(0.67);
    expect(hinted.length / spoken.length).toBeLessThan(0.73);
    for (const d of hinted) {
      expect(d.hint).toBe(d.honest ? 'weak' : 'strong');
    }
  });

  it('speaks at almost the same rate with weak and strong hands on hidden', () => {
    const hidden = habitsAt(BASE_HABITS, 'hidden');
    const rate = (strength: StrengthClass): number =>
      spots(hidden, strength, 20000, 5).filter((d) => d.speak).length / 20000;
    expect(Math.abs(rate('weak') - rate('strong'))).toBeLessThan(0.05);
  });

  it('shows strong or weak with equal chance when a medium hand lies', () => {
    const habits = habitsAt(BASE_HABITS, 'obvious');
    const rng = mulberry32(9);
    const lies: Array<StrengthClass | null> = [];
    for (let i = 0; i < 4000; i++) {
      const d = drawLine({ habits, situation: 'playerBet', strength: 'medium', mood: CALM }, rng);
      if (d.speak && !d.honest && d.hint !== null) {
        lies.push(d.hint);
      }
    }
    expect(lies).not.toContain('medium');
    const strong = lies.filter((h) => h === 'strong').length / lies.length;
    expect(strong).toBeGreaterThan(0.4);
    expect(strong).toBeLessThan(0.6);
  });

  it('never hints at hand end', () => {
    const habits = always();
    const rng = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      expect(
        drawLine({ habits, situation: 'handWon', strength: 'strong', mood: CALM }, rng).hint,
      ).toBeNull();
    }
  });
});

describe('replyIntent and state', () => {
  it('always answers for the current spot with the last situation', () => {
    const talk = createTalk({ seat: 1, rng: mulberry32(2), level: 'obvious', habits: always() });
    const t = table(talk);
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h');
    t.act(raiseTo(60), 0);
    const reply = talk.replyIntent();
    expect(reply.situation).toBe('playerBet');
    expect(reply.strength).toBe('strong');
    expect(reply.street).toBe('preflop');
    expect(reply.handNumber).toBe(1);
  });

  it('answers even when her habits keep her silent', () => {
    const silent = habitsAt(BASE_HABITS, 'obvious');
    for (const row of Object.values(silent)) {
      for (const habit of Object.values(row)) {
        habit.speak = 0;
      }
    }
    const talk = createTalk({ seat: 1, rng: mulberry32(2), level: 'obvious', habits: silent });
    const t = table(talk);
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h');
    expect(t.act(raiseTo(60), 0)).toBeNull();
    expect(talk.replyIntent().situation).toBe('playerBet');
  });

  it('exposes the hand facts for the prompt', () => {
    const talk = createTalk({ seat: 1, rng: mulberry32(2), level: 'obvious' });
    const t = table(talk);
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h');
    t.act(raiseTo(60), 0);
    expect(talk.facts()).toEqual({
      street: 'preflop',
      board: [],
      pot: 80,
      stacks: [1940, 1980],
      her: parseCards('Ah Ad'),
      actions: ['player posts 10', 'Mallorca posts 20', 'player raises to 60'],
      bigBlind: 20,
    });
  });

  it('moves mood and style with the signals it hears', () => {
    const talk = createTalk({ seat: 1, rng: mulberry32(2), level: 'obvious' });
    talk.hear(['mockBluff', 'tease']);
    expect(talk.mood().tilt).toBeCloseTo(0.5, 12);
    expect(talk.style().bluff).toBeCloseTo(1.15, 12);
  });

  it('changes the habits with setLevel', () => {
    const talk = createTalk({ seat: 1, rng: mulberry32(2), level: 'obvious', habits: always() });
    talk.setLevel('hidden');
    const t = table(talk);
    t.begin('7c 2d', 'Ah Kd', 'Qs Jh 8d 4c 9h');
    t.act(call, 0);
    const intents = t.act(raiseTo(60), 0);
    expect(intents?.situation).toBe('herBet');
  });
});

describe('summary', () => {
  it('counts hands, net, player bluffs, all-ins and signals heard', () => {
    const talk = createTalk({ seat: 1, rng: mulberry32(4), level: 'obvious' });
    const t = table(talk);
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    t.act(raiseTo(60), 0);
    t.act(fold, 0);
    t.begin('As Ah', '7c 2d', 'Kd 9h 5h 3c Jd');
    for (const action of [call, check, check, check, check, check, check]) {
      t.act(action, 0);
    }
    t.act(raiseTo(100), 0);
    t.act(call, 0);
    t.begin('Ah Ad', '7c 2d', '7h 7d 2s 3c 4c');
    t.act(raiseTo(2000), 0);
    t.act(call, 0);
    talk.hear(['tease', 'friendly']);
    talk.hear(['tease']);
    expect(talk.summary()).toEqual({
      hands: 3,
      netBb: -1 + 6 - 100,
      playerBluffsShown: 1,
      playerAllIns: 1,
      signals: { tease: 2, friendly: 1 },
    });
  });
});
