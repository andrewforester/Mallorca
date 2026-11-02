import { describe, expect, it } from 'vitest';
import { formatCard, mulberry32, parseCards } from '../cards/index.ts';
import { applyAction } from '../engine/hand.ts';
import { call, check, deckOf, fold, raiseTo, startHand } from '../engine/testDeck.ts';
import type { Action, Step } from '../engine/types.ts';
import { createPersona } from '../persona/index.ts';
import type { Moment } from '../persona/index.ts';
import { occasionText, publicFacts } from './facts.ts';
import { occasionsOf } from './occasion.ts';
import type { Occasion, OccasionKind } from './types.ts';

const HER = 1;

function play(her: string, player: string, board: string, actions: Action[]): Moment[][] {
  const persona = createPersona({ seat: HER, rng: mulberry32(5) });
  let step: Step = startHand([2000, 2000], deckOf(her, player, board), 0);
  const steps = [persona.observe(step.events, 0)];
  actions.forEach((action, k) => {
    step = applyAction(step.hand, step.seats, action);
    steps.push(persona.observe(step.events, 1000 * (k + 1)));
  });
  return steps;
}

const last = (steps: Moment[][], kind: OccasionKind): Occasion => {
  const all = steps.flatMap((m) => occasionsOf(m, HER, () => 'medium'));
  const found = all.filter((o) => o.kind === kind).pop();
  if (found === undefined) {
    throw new Error(`no ${kind}`);
  }
  return found;
};

const TO_RIVER = [call, check, check, check, check, check];

describe('public facts', () => {
  it('never hold her cards in a live hand', () => {
    const steps = play('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd', [call, raiseTo(60)]);
    const facts = publicFacts(last(steps, 'herBet'), HER);
    const cards = [...facts.board, ...(facts.card === null ? [] : [facts.card])];
    expect(facts.shown).toBeNull();
    expect(cards.some((c) => parseCards('7c 2d').includes(c))).toBe(false);
    expect(facts.actions.join(' ')).not.toMatch(/7c|2d/);
  });

  it('never hold her cards at a hand that ended without a showdown', () => {
    const steps = play('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd', [raiseTo(60), fold]);
    const facts = publicFacts(last(steps, 'handEnded'), HER);
    expect(facts.shown).toBeNull();
    expect(facts.actions.join(' ')).not.toMatch(/7c|2d/);
    expect(facts.result).toEqual({ won: false, potBb: facts.potBb });
  });

  it('show both hands after a showdown', () => {
    const steps = play('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd', [...TO_RIVER, raiseTo(40), call]);
    const facts = publicFacts(last(steps, 'handEnded'), HER);
    expect(facts.shown?.her.map(formatCard)).toEqual(['7c', '2d']);
    expect(facts.shown?.player.map(formatCard)).toEqual(['As', 'Ah']);
    expect(facts.board).toEqual(parseCards('Kd 9h 5h 3c Jd'));
  });

  it('count the pot and the stacks in big blinds', () => {
    const steps = play('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd', [call, raiseTo(60)]);
    const occasion = last(steps, 'herBet');
    const facts = publicFacts(occasion, HER);
    const bb = occasion.hand.bigBlind;
    expect(facts.potBb).toBe(occasion.hand.pot / bb);
    expect(facts.stacksBb).toEqual({
      her: occasion.hand.stacks[HER] / bb,
      player: occasion.hand.stacks[0] / bb,
    });
  });

  it('name the card of a turn or a river, not of a flop', () => {
    const steps = play('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd', TO_RIVER);
    const river = steps[steps.length - 1] as Moment[];
    const dealt = river.find((m) => m.event.type === 'streetDealt') as Moment;
    const crafted = {
      ...dealt,
      impulses: [{ emotion: 'fear' as const, amount: 0.5, reason: 'x' }],
    };
    const [card] = occasionsOf([crafted], HER, () => 'medium');
    expect(publicFacts(card as Occasion, HER).card).toEqual(parseCards('Jd')[0]);
    const flop = steps[2]?.find((m) => m.event.type === 'streetDealt') as Moment;
    const [atFlop] = occasionsOf([{ ...flop, impulses: crafted.impulses }], HER, () => 'medium');
    expect(publicFacts(atFlop as Occasion, HER).card).toBeNull();
  });

  it('tell what happened in public words only', () => {
    const steps = play('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd', [...TO_RIVER, raiseTo(40), call]);
    const end = last(steps, 'handEnded');
    const text = occasionText(end, publicFacts(end, HER));
    expect(text).toMatch(/lost/);
    const raise = play('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd', [raiseTo(60)]);
    const occasion = last(raise, 'playerRaise');
    expect(occasionText(occasion, publicFacts(occasion, HER))).toBe(
      'the player raised before the flop',
    );
  });

  it('name the card of each street of a runout dealt in one step', () => {
    const steps = play('Ah Ad', '7c 2d', 'Kd 9h 5h 3c Jd', [raiseTo(2000), call]);
    const last = steps[steps.length - 1] as Moment[];
    const fear = [{ emotion: 'fear' as const, amount: 0.5, reason: 'x' }];
    const crafted = last.map((m) =>
      m.event.type === 'streetDealt' ? { ...m, impulses: fear } : m,
    );
    const cards = occasionsOf(crafted, HER, () => 'medium').filter((o) => o.kind === 'card');
    expect(cards.map((o) => o.actionStreet)).toEqual(['flop', 'turn', 'river']);
    const turn = cards[1] as Occasion;
    expect(publicFacts(turn, HER).card).toEqual(parseCards('3c')[0]);
    expect(occasionText(cards[0] as Occasion, publicFacts(cards[0] as Occasion, HER))).toBe(
      'the flop came Kd 9h 5h',
    );
  });
});
