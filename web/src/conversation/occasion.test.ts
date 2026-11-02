import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../cards/index.ts';
import { applyAction } from '../engine/hand.ts';
import { call, check, deckOf, fold, raiseTo, startHand } from '../engine/testDeck.ts';
import type { Action, Step } from '../engine/types.ts';
import { createPersona } from '../persona/index.ts';
import type { Moment, Persona } from '../persona/index.ts';
import { CARD_IMPULSE, occasionsOf, replyOccasion } from './occasion.ts';
import type { Occasion } from './types.ts';

const HER = 1;

interface Played {
  persona: Persona;
  act(action: Action): Moment[];
}

function deal(her: string, player: string, board: string): Played {
  const persona = createPersona({ seat: HER, rng: mulberry32(5) });
  let step: Step = startHand([2000, 2000], deckOf(her, player, board), 0);
  let now = 0;
  persona.observe(step.events, now);
  return {
    persona,
    act(action) {
      step = applyAction(step.hand, step.seats, action);
      now += 1000;
      return persona.observe(step.events, now);
    },
  };
}

const occasions = (p: Played, moments: Moment[]): Occasion[] =>
  occasionsOf(moments, HER, () => p.persona.strength());

const kinds = (list: Occasion[]) => list.map((o) => o.kind);

const toRiver = (p: Played): Moment[] => {
  let last: Moment[] = [];
  for (const action of [call, check, check, check, check, check]) {
    last = p.act(action);
  }
  return last;
};

describe('occasions', () => {
  it('names the raise of the player, her raise and her fold', () => {
    const p = deal('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    expect(kinds(occasions(p, p.act(raiseTo(60))))).toEqual(['playerRaise']);
    expect(kinds(occasions(p, p.act(raiseTo(180))))).toEqual(['herBet']);
    expect(kinds(occasions(p, p.act(raiseTo(540))))).toEqual(['playerRaise']);
    expect(kinds(occasions(p, p.act(fold)))).toEqual(['herFold', 'handEnded']);
  });

  it('names her check or call and nothing for the call of the player', () => {
    const p = deal('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    expect(kinds(occasions(p, p.act(call)))).toEqual([]);
    expect(kinds(occasions(p, p.act(check))).filter((k) => k !== 'card')).toEqual(['herCall']);
  });

  it('names a call of hers that closes a street with the next street', () => {
    const p = deal('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    p.act(call);
    p.act(check);
    p.act(check);
    p.act(raiseTo(40));
    const herCall = occasions(p, p.act(call)).find((o) => o.kind === 'herCall');
    expect(herCall?.actionStreet).toBe('flop');
    expect(herCall?.street).toBe('turn');
  });

  it(`opens a card occasion only at an impulse of ${CARD_IMPULSE} and more`, () => {
    const p = deal('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    p.act(call);
    const real = p.act(check).find((m) => m.event.type === 'streetDealt') as Moment;
    const at = (amount: number): Moment => ({
      ...real,
      impulses: [{ emotion: 'fear', amount, reason: 'flop' }],
    });
    expect(occasionsOf([at(0.19)], HER, () => 'weak')).toEqual([]);
    const card = occasionsOf([at(0.2)], HER, () => 'weak');
    expect(kinds(card)).toEqual(['card']);
    expect(card[0]?.street).toBe('flop');
    expect(card[0]?.actionStreet).toBe('flop');
  });

  it('upgrades a lost showdown after her weak late bet to a caught bluff', () => {
    const p = deal('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    toRiver(p);
    p.act(raiseTo(40));
    const end = occasions(p, p.act(call)).find((o) => o.kind === 'handEnded');
    expect(end?.end).toBe('bluffCaught');
    expect(end?.endsHand).toBe(true);
    expect(end?.street).toBe('complete');
  });

  it('tells a bluff the player showed', () => {
    const p = deal('As Ah', '7c 2d', 'Kd 9h 5h 3c Jd');
    toRiver(p);
    p.act(check);
    p.act(raiseTo(40));
    const end = occasions(p, p.act(call)).find((o) => o.kind === 'handEnded');
    expect(end?.end).toBe('playerBluffShown');
  });

  it('says won or lost otherwise, and only the hand end ends the hand', () => {
    const lost = deal('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    lost.act(call);
    const all = [...occasions(lost, lost.act(raiseTo(60))), ...occasions(lost, lost.act(fold))];
    expect(all.find((o) => o.kind === 'handEnded')?.end).toBe('won');
    expect(all.filter((o) => o.endsHand).map((o) => o.kind)).toEqual(['handEnded']);
    const folded = deal('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    folded.act(raiseTo(60));
    const end = occasions(folded, folded.act(fold)).find((o) => o.kind === 'handEnded');
    expect(end?.end).toBe('lost');
  });

  it('takes the class of the moment, else the class now', () => {
    const p = deal('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    p.act(call);
    const moments = p.act(raiseTo(60));
    const card = p.act(call).find((m) => m.event.type === 'streetDealt');
    const bet = moments.find((m) => m.event.type === 'acted') as Moment;
    expect(occasions(p, moments)[0]?.strength).toBe(bet.strength);
    const dealt = {
      ...(card as Moment),
      impulses: [{ emotion: 'fear' as const, amount: 0.5, reason: 'x' }],
    };
    expect(dealt.strength).toBeNull();
    expect(occasionsOf([dealt], HER, () => 'strong')[0]?.strength).toBe('strong');
  });

  it('builds the occasion of a line of the player', () => {
    const p = deal('7c 2d', 'As Ah', 'Kd 9h 5h 3c Jd');
    const hand = p.persona.view(0).hand;
    const said = replyOccasion('hi', hand, 'weak', 'herBet');
    expect(said).toMatchObject({
      kind: 'playerSaid',
      text: 'hi',
      previous: 'herBet',
      impulses: [],
      journalIds: [],
      strength: 'weak',
      end: null,
      endsHand: false,
    });
  });
});
