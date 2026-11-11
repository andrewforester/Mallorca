import { describe, expect, it } from 'vitest';
import { fullDeck, mulberry32, parseCards, shuffle } from '../cards/index.ts';
import { applyAction } from '../engine/hand.ts';
import { call, check, deckOf, fold, raiseTo, startHand } from '../engine/testDeck.ts';
import type { Action, Step } from '../engine/types.ts';
import { MALLORCA } from '../emotion/index.ts';
import { FEELS_AFTER_MS } from './planner.ts';
import type { Planned } from './planner.ts';
import { RULES } from './rules.ts';
import type { Rule } from './rules.ts';
import { createSpeaker } from './testSpeaker.ts';
import type { Speaker } from './testSpeaker.ts';
import type { OccasionKind } from './types.ts';

const PRICKLY = {
  ...MALLORCA,
  bigFive: { ...MALLORCA.bigFive, agreeableness: -0.6 },
};

const ALWAYS: Rule[] = RULES.filter((r) => r.occasion !== 'card').map((r) => ({ ...r, chance: 1 }));
const NEVER: Rule[] = RULES.map((r) => ({ ...r, chance: r.occasion === 'playerSaid' ? 1 : 0 }));

interface Table {
  conversation: Speaker;
  begin(her: string, player: string, board: string, nowMs?: number): Planned;
  act(action: Action, nowMs?: number): Planned;
}

function table(conversation: Speaker, stacks: [number, number] = [2000, 2000]): Table {
  let step: Step | null = null;
  return {
    conversation,
    begin(her, player, board, nowMs = 0) {
      step = startHand(stacks, deckOf(her, player, board), 0);
      return conversation.observe(step.events, nowMs);
    },
    act(action, nowMs = 0) {
      const current = step as Step;
      step = applyAction(current.hand, current.seats, action);
      return conversation.observe(step.events, nowMs);
    },
  };
}

const chatty = (): Table => table(createSpeaker({ seat: 1, rng: mulberry32(3), rules: ALWAYS }));

const spoken = (planned: Planned): OccasionKind | null =>
  planned.verdicts.find((v) => v.speak)?.occasion.kind ?? null;

describe('observe', () => {
  it('plans a line at her raise with the spot of the event', () => {
    const t = chatty();
    t.begin('7c 2d', 'Ah Kd', 'Qs Jh 8d 4c 9h');
    expect(spoken(t.act(call))).toBeNull();
    const planned = t.act(raiseTo(60), 2000);
    const verdict = planned.verdicts.find((v) => v.speak);
    expect(verdict?.occasion).toMatchObject({
      kind: 'herBet',
      strength: 'weak',
      street: 'preflop',
      actionStreet: 'preflop',
      handNumber: 1,
    });
    const claim = planned.plan?.claim ?? null;
    expect(claim === null || claim.honest === (claim.about !== 'strong')).toBe(true);
  });

  it('speaks at his raise and at her check or call, one line a street', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h');
    expect(spoken(t.act(raiseTo(60), 0))).toBe('playerRaise');
    expect(spoken(t.act(call, 5000))).toBeNull();
    const herCheck = t.act(check, 10000);
    expect(spoken(herCheck)).toBe('herCall');
    expect(herCheck.plan?.street).toBe('flop');
    expect(spoken(t.act(raiseTo(40), 15000))).toBeNull();
    expect(spoken(t.act(call, 20000))).toBeNull();
    const herCall = t.act(check, 25000);
    expect(spoken(herCall)).toBe('herCall');
    expect(herCall.plan?.street).toBe('turn');
  });

  it('allows one unprompted line a street and none within 1500 ms', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h', 0);
    expect(spoken(t.act(raiseTo(60), 0))).toBe('playerRaise');
    expect(spoken(t.act(raiseTo(180), 5000))).toBeNull();
    expect(spoken(t.act(call, 5000))).toBeNull();
    expect(t.act(raiseTo(100), 5100).plan?.street).toBe('flop');
    expect(spoken(t.act(call, 5200))).toBeNull();
    expect(spoken(t.act(raiseTo(200), 6000))).toBeNull();
    const late = t.act(raiseTo(600), 7000);
    expect(spoken(late)).toBe('playerRaise');
    expect(late.plan?.street).toBe('turn');
  });

  it('lets a line on a call that closes the street take the next street slot', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h', 0);
    expect(spoken(t.act(call, 0))).toBeNull();
    const closing = t.act(check, 2000);
    expect(spoken(closing)).toBe('herCall');
    expect(closing.plan?.street).toBe('flop');
    expect(spoken(t.act(check, 5000))).toBeNull();
  });

  it('keeps the street of the action when her call closes the street', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h', 0);
    t.act(call, 0);
    const closing = t.act(check, 2000);
    expect(closing.plan).toMatchObject({ street: 'flop', actionStreet: 'preflop' });
    expect(t.conversation.reply().plan).toMatchObject({ street: 'flop', actionStreet: 'flop' });
  });

  it('marks a line at the end of a hand', () => {
    const t = chatty();
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    t.act(raiseTo(60), 0);
    const end = t.act(fold, 2000);
    expect(end.plan?.endsHand).toBe(true);
    expect(end.verdicts[0]?.occasion.end).toBe('lost');
  });

  it('answers a new hand with no previous occasion', () => {
    const t = chatty();
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    t.act(raiseTo(60), 0);
    expect(t.act(fold, 2000).verdicts[0]?.occasion.end).toBe('lost');
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd', 4000);
    expect(t.conversation.reply().verdicts[0]?.occasion.previous).toBeNull();
  });

  it('upgrades a lost showdown after her river bet with a weak hand to a caught bluff', () => {
    const t = chatty();
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    for (const [i, action] of [call, check, check, check, check, check].entries()) {
      t.act(action, 1000 * (i + 1) * 2);
    }
    t.act(raiseTo(40), 20000);
    t.conversation.impulses();
    const end = t.act(call, 40000);
    expect(end.verdicts[0]?.occasion.end).toBe('bluffCaught');
    expect(end.plan?.claim).toBeNull();
    const felt = t.conversation.impulses();
    expect(felt.some((i) => i.emotion === 'shame' && i.amount > 0)).toBe(true);
    expect(felt.filter((i) => i.emotion === 'injustice')).toEqual([]);
    expect(t.conversation.feelingAt(40000 + FEELS_AFTER_MS).emotions.shame).toBeGreaterThan(0);
  });

  it('says lost without a bluff when she only checked and lost', () => {
    const t = chatty();
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    let end: Planned | null = null;
    for (const [i, action] of [call, check, check, check, check, check, check, check].entries()) {
      end = t.act(action, 2000 * (i + 1));
    }
    expect(end?.verdicts[0]?.occasion.end).toBe('lost');
    expect(end?.plan?.street).toBe('complete');
  });
});

describe('outcomes', () => {
  it('counts a preflop fold in the session without injustice', () => {
    const t = chatty();
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    t.act(raiseTo(60), 0);
    expect(t.act(fold, 2000).verdicts[0]?.occasion.end).toBe('lost');
    expect(t.conversation.feeling().sessionNetBb).toBe(-1);
    expect(t.conversation.feeling().emotions.injustice).toBe(0);
  });

  it('counts a split pot as won without distress', () => {
    const t = chatty();
    t.begin('2c 3d', '4c 5d', 'As Ks Qs Js Ts');
    t.act(raiseTo(100), 0);
    t.act(call, 2000);
    for (let i = 0; i < 5; i++) {
      t.act(check, 4000 + 2000 * i);
    }
    t.conversation.impulses();
    const end = t.act(check, 14000);
    expect(end.verdicts[0]?.occasion.end).toBe('won');
    expect(t.conversation.feeling().sessionNetBb).toBe(0);
    expect(t.conversation.impulses().filter((i) => i.emotion === 'distress')).toEqual([]);
  });

  it('feels robbed after an all-in runout lost from ahead and overloads', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', '7h 7d 2s 3c 4c');
    t.act(raiseTo(2000), 0);
    expect(t.act(call, 2000).verdicts[0]?.occasion.end).toBe('lost');
    const feeling = t.conversation.feelingAt(2000 + FEELS_AFTER_MS);
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
    expect(t.conversation.feeling().sessionNetBb).toBe(-100);
    expect(t.conversation.feeling().emotions.injustice).toBe(0);
  });
});

describe('reproducibility', () => {
  const play = (rules?: readonly Rule[]) => {
    const conversation = createSpeaker({ seat: 1, rng: mulberry32(9), rules });
    const decks = mulberry32(2);
    let now = 0;
    for (let i = 0; i < 12; i++) {
      let step = startHand([2000, 2000], shuffle(fullDeck(), decks), 0);
      conversation.observe(step.events, (now += 3000));
      step = applyAction(step.hand, step.seats, raiseTo(2000));
      conversation.observe(step.events, (now += 3000));
      step = applyAction(step.hand, step.seats, call);
      conversation.observe(step.events, (now += 3000));
    }
    return {
      feeling: conversation.feeling(),
      words: conversation.moodWords(),
      bias: conversation.bias(),
    };
  };

  it('keeps the same feeling and bias for a seed and a clock whatever lines she speaks', () => {
    expect(play(ALWAYS)).toEqual(play());
  });
});

describe('replies', () => {
  it('always answers for the current spot after the last occasion', () => {
    const t = table(createSpeaker({ seat: 1, rng: mulberry32(2), rules: ALWAYS }));
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h');
    t.act(raiseTo(60), 0);
    const reply = t.conversation.reply();
    expect(reply.verdicts[0]?.occasion).toMatchObject({
      kind: 'playerSaid',
      previous: 'playerRaise',
      strength: 'strong',
      street: 'preflop',
      handNumber: 1,
    });
    expect(reply.plan?.handNumber).toBe(1);
  });

  it('answers even when her rules keep her silent', () => {
    const t = table(createSpeaker({ seat: 1, rng: mulberry32(2), rules: NEVER }));
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h');
    expect(t.act(raiseTo(60), 0).plan).toBeNull();
    expect(t.conversation.reply().plan?.act).toMatch(/answer|claim/);
  });

  it('gives the public facts of the hand and none of her cards', () => {
    const t = table(createSpeaker({ seat: 1, rng: mulberry32(2) }));
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h');
    t.act(raiseTo(60), 0);
    const facts = t.conversation.reply().plan?.facts;
    expect(facts).toEqual({
      street: 'preflop',
      board: [],
      potBb: 4,
      stacksBb: { her: 99, player: 97 },
      actions: ['player posts 10', 'Mallorca posts 20', 'player raises to 60'],
      card: null,
      result: null,
      shown: null,
    });
  });

  it('moves her feeling and bias with the signals it hears', () => {
    const conversation = createSpeaker({ seat: 1, rng: mulberry32(2) });
    conversation.setPersonality(PRICKLY);
    conversation.observe([], 0);
    conversation.hear(['mockBluff', 'tease']);
    conversation.observe([], 2000);
    expect(conversation.feeling().emotions.anger).toBeGreaterThan(0.2);
    expect(conversation.moodWords()).toContain('annoyed');
    expect(conversation.bias().bluff).toBeGreaterThan(1);
  });

  it('hears the anger in her voice once her mask lets it through', () => {
    const conversation = createSpeaker({ seat: 1, rng: mulberry32(2) });
    conversation.setPersonality(PRICKLY);
    conversation.observe([], 0);
    conversation.hear(['mockBluff', 'tease']);
    const voice = conversation.reply().plan?.voice;
    conversation.observe([], FEELS_AFTER_MS);
    expect(voice?.emotion).toBe('anger');
    const anger = conversation.feeling().emotions.anger * (1 - conversation.mask());
    expect(voice?.intensity).toBeCloseTo(anger, 2);
  });

  it('acts a strength she claims falsely only behind her mask', () => {
    const conversation = createSpeaker({ seat: 1, rng: mulberry32(2) });
    const t = table(conversation);
    t.begin('7c 2d', 'Ah Kd', 'Qs Jh 8d 4c 9h');
    t.act(call, 0);
    t.act(raiseTo(60), 500);
    expect(conversation.mask()).toBeGreaterThan(0.5);
    expect(conversation.view().presenting?.shows).toBe('strong');
  });
});

describe('summary', () => {
  it('counts hands, net, player bluffs, all-ins and signals heard', () => {
    const conversation = createSpeaker({ seat: 1, rng: mulberry32(4) });
    const t = table(conversation);
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
    conversation.hear(['tease', 'friendly']);
    conversation.hear(['tease']);
    expect(conversation.summary()).toEqual({
      hands: 3,
      netBb: -1 + 6 - 100,
      playerBluffsShown: 1,
      playerAllIns: 1,
      signals: { tease: 2, friendly: 1 },
      notable: [{ kind: 'bigLoss', handNumber: 1, potBb: 200, won: false, bets: 1 }],
    });
  });
});

describe('what the face reads', () => {
  it('drains the impulses of her feeling once', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h');
    const dealt = t.conversation.impulses();
    expect(dealt.some((i) => i.emotion === 'hope')).toBe(true);
    expect(t.conversation.impulses()).toEqual([]);
  });

  it('reads her feeling ahead in time without changing it', () => {
    const t = chatty();
    t.begin('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd', 0);
    t.act(raiseTo(60), 1000);
    t.act(fold, 2000);
    const now = t.conversation.feeling();
    const later = t.conversation.feelingAt(30_000);
    expect(t.conversation.feeling()).toEqual(now);
    expect(later.time).toBeCloseTo(now.time + 28);
    expect(t.conversation.feelingAt(1000)).toEqual(now);
  });

  it('bluffs after her raise with a weak hand until the street changes', () => {
    const t = chatty();
    t.begin('7c 2d', 'Ah Kd', 'Qs Jh 8d 4c 9h');
    expect(t.conversation.stance()).toBeNull();
    t.act(call);
    t.act(raiseTo(60));
    expect(t.conversation.stance()).toBe('bluff');
    t.act(call);
    expect(t.conversation.stance()).toBeNull();
  });

  it('hides a strong hand while the hand runs', () => {
    const t = chatty();
    t.begin('Ah Ad', '7c 2d', 'Qs Jh 8d 4c 9h');
    t.act(raiseTo(60));
    t.act(call);
    expect(t.conversation.stance()).toBe('hide');
    t.act(check);
    t.act(raiseTo(100));
    t.act(fold);
    expect(t.conversation.stance()).toBeNull();
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

  const equity = (t: Table): number => t.conversation.feeling().prospect?.equity ?? Number.NaN;

  it('narrows her equity for the hand it belongs to', () => {
    const t = raised();
    const before = equity(t);
    t.conversation.playerRange(strong(), 1);
    expect(equity(t)).toBeLessThan(before - 0.4);
  });

  it('ignores a range of another hand', () => {
    const t = raised();
    const before = t.conversation.feeling();
    t.conversation.playerRange(strong(), 2);
    expect(t.conversation.feeling()).toEqual(before);
  });
});
