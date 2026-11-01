import { describe, expect, it } from 'vitest';
import { fullDeck, mulberry32, parseCards, shuffle } from '../cards/index.ts';
import { applyAction } from '../engine/hand.ts';
import { call, check, deckOf, fold, raiseTo, startHand } from '../engine/testDeck.ts';
import type { Action, Step } from '../engine/types.ts';
import { BASE_HABITS, habitsAt } from './habits.ts';
import type { Habits, Situation } from './habits.ts';
import type { StrengthClass } from './strength.ts';
import { MALLORCA } from '../emotion/index.ts';
import { characterOf } from './state.ts';
import { createTalk, drawLine, endsHand } from './talk.ts';
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
      actionStreet: 'preflop',
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

  it('keeps the street of the action for the cue when her call closes the street', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h', 0);
    t.act(call, 0);
    const closing = t.act(check, 2000);
    expect(closing).toMatchObject({ street: 'flop', actionStreet: 'preflop' });
    const reply = t.talk.replyIntent();
    expect(reply).toMatchObject({ street: 'flop', actionStreet: 'flop' });
  });

  it('names the situations that end a hand', () => {
    expect(['handWon', 'handLost', 'bluffCaught'].every((s) => endsHand(s as Situation))).toBe(
      true,
    );
    expect(['herBet', 'herCall', 'playerBet'].some((s) => endsHand(s as Situation))).toBe(false);
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
    expect(t.talk.feeling().emotions.shame).toBeGreaterThan(0);
    expect(t.talk.feeling().emotions.injustice).toBe(0);
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
  it('counts a preflop fold in the session without injustice', () => {
    const t = chatty();
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    t.act(raiseTo(60), 0);
    expect(t.act(fold, 2000)?.situation).toBe('handLost');
    expect(t.talk.feeling().sessionNetBb).toBe(-1);
    expect(t.talk.feeling().emotions.injustice).toBe(0);
  });

  it('counts a split pot as won without distress', () => {
    const t = chatty();
    t.begin('2c 3d', '4c 5d', 'As Ks Qs Js Ts');
    t.act(raiseTo(100), 0);
    t.act(call, 2000);
    let end: LineIntent | null = null;
    for (let i = 0; i < 6; i++) {
      end = t.act(check, 4000 + 2000 * i);
    }
    expect(end?.situation).toBe('handWon');
    expect(t.talk.feeling().sessionNetBb).toBe(0);
    expect(t.talk.feeling().emotions.distress).toBe(0);
  });

  it('feels robbed after an all-in runout lost from ahead and overloads', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', '7h 7d 2s 3c 4c');
    t.act(raiseTo(2000), 0);
    const end = t.act(call, 2000);
    expect(end?.situation).toBe('handLost');
    const feeling = t.talk.feeling();
    expect(feeling.emotions.injustice).toBeGreaterThan(0.3);
    expect(feeling.load.overload).toBeGreaterThan(0.5);
  });

  it('does not feel robbed when the money went in on the river behind', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', '7h 7d 2s 3c 4c');
    for (const action of [call, check, check, check, check, check, check]) {
      t.act(action, 0);
    }
    t.act(raiseTo(1980), 0);
    t.act(call, 0);
    expect(t.talk.feeling().sessionNetBb).toBe(-100);
    expect(t.talk.feeling().emotions.injustice).toBe(0);
  });
});

describe('reproducibility', () => {
  const play = (habits?: Habits) => {
    const talk = createTalk({ seat: 1, rng: mulberry32(9), level: 'obvious', habits });
    const decks = mulberry32(2);
    let now = 0;
    for (let i = 0; i < 12; i++) {
      let step = startHand([2000, 2000], shuffle(fullDeck(), decks), 0);
      talk.observe(step.events, (now += 3000));
      step = applyAction(step.hand, step.seats, raiseTo(2000));
      talk.observe(step.events, (now += 3000));
      step = applyAction(step.hand, step.seats, call);
      talk.observe(step.events, (now += 3000));
    }
    return { feeling: talk.feeling(), words: talk.moodWords(), style: talk.style() };
  };

  it('keeps the same feeling and style for a seed and a clock whatever lines she speaks', () => {
    expect(play(always())).toEqual(play());
  });
});

describe('drawLine', () => {
  const spots = (habits: Habits, strength: StrengthClass, count: number, seed: number) => {
    const rng = mulberry32(seed);
    const draws = [];
    for (let i = 0; i < count; i++) {
      draws.push(drawLine({ habits, situation: 'herBet', strength, speakFactor: 1 }, rng));
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
      const d = drawLine(
        { habits, situation: 'playerBet', strength: 'medium', speakFactor: 1 },
        rng,
      );
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
        drawLine({ habits, situation: 'handWon', strength: 'strong', speakFactor: 1 }, rng).hint,
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

  it('moves her feeling and style with the signals it hears', () => {
    const talk = createTalk({ seat: 1, rng: mulberry32(2), level: 'obvious' });
    talk.hear(['mockBluff', 'tease']);
    expect(talk.feeling().emotions.anger).toBeGreaterThan(0.4);
    expect(talk.moodWords()).toContain('annoyed');
    expect(talk.style().bluff).toBeGreaterThan(1);
  });

  it('gives the feeling for an intent, acting the hinted strength only when the hint is false', () => {
    const talk = createTalk({ seat: 1, rng: mulberry32(2), level: 'obvious' });
    talk.hear(['mockBluff', 'tease']);
    const intent = talk.replyIntent();
    const bluff = { ...intent, hint: 'strong' as const, honest: false };
    expect(talk.feelingFor(bluff).shows.acting).toBe('strong');
    expect(talk.feelingFor({ ...bluff, honest: true }).shows.acting).toBeNull();
    expect(talk.feelingFor(bluff).emotions[0]?.name).toBe('anger');
  });

  it('gives her character sheet', () => {
    const talk = createTalk({ seat: 1, rng: mulberry32(2), level: 'obvious' });
    expect(talk.character()).toEqual(characterOf(MALLORCA));
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

describe('what the face reads', () => {
  it('drains the impulses of her feeling once', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h');
    const dealt = t.talk.impulses();
    expect(dealt.some((i) => i.emotion === 'joy')).toBe(true);
    expect(t.talk.impulses()).toEqual([]);
  });

  it('reads her feeling ahead in time without changing it', () => {
    const t = chatty();
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd', 0);
    t.act(raiseTo(60), 1000);
    t.act(fold, 2000);
    const now = t.talk.feeling();
    const later = t.talk.feelingAt(30_000);
    expect(t.talk.feeling()).toEqual(now);
    expect(later.time).toBeCloseTo(now.time + 28);
    expect(t.talk.feelingAt(1000)).toEqual(now);
  });

  it('bluffs after her raise with a weak hand until the street changes', () => {
    const t = chatty();
    t.begin('7c 2d', 'Ah Kd', 'Qs Jh 8d 4c 9h');
    expect(t.talk.stance()).toBeNull();
    t.act(call);
    t.act(raiseTo(60));
    expect(t.talk.stance()).toBe('bluff');
    t.act(call);
    expect(t.talk.stance()).toBeNull();
  });

  it('hides a strong hand while the hand runs', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h');
    t.act(raiseTo(60));
    t.act(call);
    expect(t.talk.stance()).toBe('hide');
    t.act(check);
    t.act(raiseTo(100));
    t.act(fold);
    expect(t.talk.stance()).toBeNull();
  });
});

describe("the player's range", () => {
  const strong = (): Float32Array => {
    const weights = new Float32Array(1326);
    for (const hand of ['8c 8h', '4c 4d', 'Kd 8c']) {
      const [a, b] = parseCards(hand) as [number, number];
      const [lo, hi] = a < b ? [a, b] : [b, a];
      weights[(hi * (hi - 1)) / 2 + lo] = 1;
    }
    return weights;
  };

  const raised = (): Table => {
    const t = chatty();
    t.begin('Kh Qd', '7c 6c', 'Kc 8d 4s 2h 3c');
    t.act(call, 1000);
    t.act(check, 1500);
    t.act(raiseTo(40), 2000);
    t.act(raiseTo(120), 2500);
    return t;
  };

  const equity = (t: Table): number => t.talk.feeling().prospect?.equity ?? Number.NaN;

  it('narrows her equity for the hand it belongs to', () => {
    const t = raised();
    const before = equity(t);
    t.talk.playerRange(strong(), 1);
    expect(equity(t)).toBeLessThan(before - 0.4);
  });

  it('ignores a range of another hand', () => {
    const t = raised();
    const before = t.talk.feeling();
    t.talk.playerRange(strong(), 2);
    expect(t.talk.feeling()).toEqual(before);
  });
});
