import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../cards/index.ts';
import { PERSONALITIES } from '../emotion/index.ts';
import { applyAction } from '../engine/hand.ts';
import { call, deckOf, raiseTo, startHand } from '../engine/testDeck.ts';
import type { Action, Step } from '../engine/types.ts';
import { BASE_HABITS } from './habits.ts';
import type { Habits, Situation } from './habits.ts';
import { JOURNAL_SIZE } from './journal.ts';
import { createTalk } from './talk.ts';
import type { LineIntent, Talk } from './talk.ts';

const habits = (speak: number): Habits => {
  const row = {
    strong: { speak, honest: 1 },
    medium: { speak, honest: 1 },
    weak: { speak, honest: 1 },
  };
  const situations = Object.keys(BASE_HABITS) as Situation[];
  return Object.fromEntries(situations.map((s) => [s, row])) as Habits;
};

const newTalk = (speak = 0): Talk =>
  createTalk({ seat: 1, rng: mulberry32(3), level: 'obvious', habits: habits(speak) });

function play(talk: Talk, actions: Action[], her = 'As Ah', player = 'Js Ts'): LineIntent[] {
  let step: Step = startHand([2000, 2000], deckOf(her, player, 'Kc 9d 2s 3h Qh'), 0);
  const intents: (LineIntent | null)[] = [talk.observe(step.events, 0)];
  actions.forEach((action, i) => {
    step = applyAction(step.hand, step.seats, action);
    intents.push(talk.observe(step.events, (i + 1) * 1000));
  });
  return intents.filter((x): x is LineIntent => x !== null);
}

const badBeat = [raiseTo(60), raiseTo(2000), call];

describe('journal', () => {
  it('is empty before any event', () => {
    expect(newTalk().journal()).toEqual([]);
  });

  it('lists the events she felt, newest first, with their impulses and reasons', () => {
    const talk = newTalk();
    play(talk, badBeat);
    const journal = talk.journal();
    expect(journal.at(-1)?.event.kind).toBe('deal');
    expect(journal[0]?.event.kind).toBe('result');
    expect(journal.every((e) => e.handNumber === 1)).toBe(true);
    const result = journal[0];
    expect(result?.impulses.length).toBeGreaterThan(0);
    expect(result?.impulses.every((i) => i.reason.length > 0)).toBe(true);
    expect(result?.words).toEqual(talk.moodWords());
    expect(journal.every((e) => !e.spoke)).toBe(true);
  });

  it('marks the entries of a step where she spoke', () => {
    const talk = newTalk(1);
    const intents = play(talk, [raiseTo(60)]);
    expect(intents.length).toBeGreaterThan(0);
    expect(talk.journal()[0]?.spoke).toBe(true);
  });

  it('records what she hears', () => {
    const talk = newTalk();
    talk.hear(['mockBluff']);
    const [entry] = talk.journal();
    expect(entry?.event).toEqual({ kind: 'chat', signal: 'mockBluff' });
    expect(entry?.impulses.some((i) => i.emotion === 'anger')).toBe(true);
    expect(entry?.spoke).toBe(false);
  });

  it(`keeps at most ${JOURNAL_SIZE} entries`, () => {
    const talk = newTalk();
    for (let i = 0; i < JOURNAL_SIZE + 10; i++) talk.hear(['friendly']);
    expect(talk.journal()).toHaveLength(JOURNAL_SIZE);
  });
});

describe('the personality of her feeling', () => {
  it('lets Lola loosen up more than Mallorca after a bad beat', () => {
    const calm = newTalk();
    const lola = newTalk();
    lola.setPersonality(PERSONALITIES.lola);
    play(calm, badBeat);
    play(lola, badBeat);
    expect(lola.bias().tightness).toBeLessThan(calm.bias().tightness);
    expect(lola.feeling().traits).not.toEqual(calm.feeling().traits);
    expect(lola.character().talkativeness).toBeGreaterThan(calm.character().talkativeness);
  });

  it('starts over on resetFeeling', () => {
    const talk = newTalk();
    play(talk, badBeat);
    expect(talk.feeling().sessionNetBb).toBe(-100);
    talk.resetFeeling();
    expect(talk.feeling().sessionNetBb).toBe(0);
    expect(talk.journal()).toEqual([]);
    expect(talk.bias()).toEqual({
      aggression: 1,
      bluff: 1,
      tightness: 1,
      sizing: 1,
      stickiness: 1,
    });
  });
});
