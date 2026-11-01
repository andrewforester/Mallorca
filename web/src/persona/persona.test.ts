import { describe, expect, it } from 'vitest';
import { mulberry32, parseCard } from '../cards/index.ts';
import { applyAction } from '../engine/hand.ts';
import { call, check, deckOf, raiseTo, startHand } from '../engine/testDeck.ts';
import type { Action, Step } from '../engine/types.ts';
import { maskOf } from '../emotion/index.ts';
import { JOURNAL_SIZE } from './journal.ts';
import { createPersona } from './persona.ts';
import type { Moment, Persona } from './persona.ts';

const HER = 1;

interface Played {
  persona: Persona;
  moments: Moment[];
  act(action: Action, nowMs: number): Moment[];
}

function deal(her: string, player: string, board: string, persona = newPersona()): Played {
  let step: Step = startHand([2000, 2000], deckOf(her, player, board), 0);
  const moments = persona.observe(step.events, 0);
  return {
    persona,
    moments,
    act(action, nowMs) {
      step = applyAction(step.hand, step.seats, action);
      return persona.observe(step.events, nowMs);
    },
  };
}

function newPersona(): Persona {
  return createPersona({ seat: HER, rng: mulberry32(5) });
}

const badBeat = (played: Played): void => {
  played.act(raiseTo(60), 1000);
  played.act(raiseTo(2000), 2000);
  played.act(call, 3000);
};

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

describe('a persona at the table', () => {
  it('is not moved by a view', () => {
    const viewed = deal('As Ah', 'Js Ts', 'Kc 9d 2s 3h Qh');
    const plain = deal('As Ah', 'Js Ts', 'Kc 9d 2s 3h Qh');
    badBeat(viewed);
    badBeat(plain);
    const first = viewed.persona.view(5000).snapshot;
    expect(viewed.persona.view(5000).snapshot).toEqual(first);
    expect(first.time).toBeCloseTo(5);
    expect(viewed.persona.view(3000).snapshot.time).toBeCloseTo(3);
    viewed.persona.observe([], 6000);
    plain.persona.observe([], 6000);
    expect(viewed.persona.view(6000).snapshot).toEqual(plain.persona.view(6000).snapshot);
  });

  it('gives two cursors the same impulses, oldest first', () => {
    const played = deal('As Ah', 'Js Ts', 'Kc 9d 2s 3h Qh');
    badBeat(played);
    const one = played.persona.journalSince(0);
    const two = played.persona.journalSince(0);
    expect(two).toEqual(one);
    expect(one.map((e) => e.id)).toEqual(one.map((_, k) => k + 1));
    expect(played.persona.journal().map((e) => e.id)).toEqual([...one].reverse().map((e) => e.id));
    expect(played.persona.lastJournalId()).toBe(one.length);
    const later = played.persona.journalSince(2);
    expect(later[0]?.id).toBe(3);
  });

  it(`keeps the newest ${JOURNAL_SIZE} entries`, () => {
    const persona = newPersona();
    for (let i = 0; i < JOURNAL_SIZE + 10; i++) persona.hear(['friendly']);
    expect(persona.journal()).toHaveLength(JOURNAL_SIZE);
    expect(persona.journal()[0]?.id).toBe(JOURNAL_SIZE + 10);
  });

  it('gives one moment per event, with the hand before and after', () => {
    const played = deal('Kh Qd', '7c 6c', 'Kc 8d 4s 2h 3c');
    expect(played.moments.find((m) => m.event.type === 'blindPosted')?.strength).toBeNull();
    const limp = played.act(call, 1000);
    expect(limp.map((m) => m.event.type)).toEqual(['acted']);
    expect(limp[0]?.strength).toBeNull();
    const closed = played.act(check, 1500);
    expect(closed[0]?.event.type).toBe('acted');
    expect(closed[0]?.strength).not.toBeNull();
    const flop = closed.find((m) => m.event.type === 'streetDealt');
    expect(flop?.before.street).toBe('preflop');
    expect(flop?.after.street).toBe('flop');
  });

  it('sizes up her hand at the end of a hand and tells a shown bluff of the player', () => {
    const played = deal('Kh Qd', '7c 6c', 'Kc 8d 4s 2h 3c');
    [call, check, check, check, check, check, check, raiseTo(60)].forEach((action, k) =>
      played.act(action, (k + 1) * 500),
    );
    const end = played.act(call, 5000);
    const ended = end.find((m) => m.event.type === 'handEnded');
    expect(ended?.strength).not.toBeNull();
    expect(ended?.playerBluffShown).toBe(true);
    const others = end.filter((m) => m.event.type !== 'handEnded');
    expect(others.every((m) => !m.playerBluffShown)).toBe(true);
  });

  it('ignores a range for another hand', () => {
    const played = deal('Kh Qd', '7c 6c', 'Kc 8d 4s 2h 3c');
    played.act(call, 1000);
    const before = played.persona.view(1000).snapshot;
    played.persona.narrow(SETS_AND_TWO_PAIR, 7);
    expect(played.persona.view(1000).snapshot).toEqual(before);
  });

  it('feels a narrowed range at once', () => {
    const played = deal('Kh Qd', '7c 6c', 'Kc 8d 4s 2h 3c');
    played.act(call, 1000);
    played.act(check, 1500);
    played.act(raiseTo(40), 2000);
    played.act(raiseTo(120), 2500);
    expect(played.persona.view(2500).snapshot.prospect?.equity).toBeGreaterThan(0.75);
    played.persona.narrow(SETS_AND_TWO_PAIR, 1);
    expect(played.persona.view(2500).snapshot.prospect?.equity).toBeLessThan(0.3);
  });

  it('hears a tease as an entry of the journal', () => {
    const persona = newPersona();
    persona.hear(['tease']);
    expect(persona.journal()[0]?.event).toEqual({ kind: 'chat', signal: 'tease' });
  });

  it('acts a bluff after her weak bet and hides a strong hand', () => {
    const weak = deal('7c 2d', 'Ah Kd', 'Qs Jh 8d 4c 9h');
    weak.act(call, 1000);
    weak.act(raiseTo(60), 1500);
    expect(weak.persona.view(1500).stance).toBe('bluff');
    const strong = deal('As Ah', 'Js Ts', 'Kc 9d 2s 3h Qh');
    strong.act(call, 1000);
    strong.act(check, 1500);
    expect(strong.persona.view(1500).stance).toBe('hide');
  });

  it('takes her class from her equity against the range she reads', () => {
    const played = deal('Kh Qd', '7c 6c', 'Kc 8d 4s 2h 3c');
    [call, check, raiseTo(40), raiseTo(120)].forEach((action, k) =>
      played.act(action, (k + 1) * 500),
    );
    expect(played.persona.strength()).toBe('strong');
    expect(played.persona.view(2000).presenting?.stance).toBe('hide');
    played.persona.narrow(SETS_AND_TWO_PAIR, 1);
    expect(played.persona.strength()).toBe('weak');
    expect(played.persona.view(2000).presenting).toBeNull();
  });

  it('presents strength after her weak bet, with the bluff effort', () => {
    const weak = deal('7c 2d', 'Ah Kd', 'Qs Jh 8d 4c 9h');
    weak.act(call, 1000);
    weak.act(raiseTo(60), 1500);
    expect(weak.persona.view(1500).presenting).toEqual({
      stance: 'bluff',
      shows: 'strong',
      effort: 0.6,
    });
  });

  it('presents weakness on a strong hand, with the hide effort', () => {
    const strong = deal('As Ah', 'Js Ts', 'Kc 9d 2s 3h Qh');
    strong.act(call, 1000);
    strong.act(check, 1500);
    expect(strong.persona.view(1500).presenting).toEqual({
      stance: 'hide',
      shows: 'weak',
      effort: 0.5,
    });
  });

  it('hides the share of her feeling her mask and her effort give', () => {
    const weak = deal('7c 2d', 'Ah Kd', 'Qs Jh 8d 4c 9h');
    weak.act(call, 1000);
    const calm = weak.persona.view(1000);
    expect(calm.presenting).toBeNull();
    expect(calm.mask).toBeCloseTo(
      maskOf(calm.snapshot.traits.mask, 0, calm.snapshot.load.overload),
      12,
    );
    weak.act(raiseTo(60), 1500);
    const acting = weak.persona.view(1500);
    expect(acting.mask).toBeCloseTo(
      maskOf(acting.snapshot.traits.mask, 0.6, acting.snapshot.load.overload),
      12,
    );
    expect(acting.mask).toBeGreaterThan(calm.mask);
  });

  it('judges her hand at the end before his cards were shown', () => {
    const played = deal('As Ah', '9s 9h', 'Kc 9d 2s 3h Qh');
    [call, check, check, check, check, check, check].forEach((action, k) =>
      played.act(action, (k + 1) * 500),
    );
    const end = played.act(check, 5000);
    expect(end.some((m) => m.event.type === 'showdown')).toBe(true);
    expect(end.find((m) => m.event.type === 'handEnded')?.strength).toBe('strong');
  });

  const entries = (persona: Persona, kind: string) =>
    persona.journal().filter((e) => e.event.kind === kind);

  it('feels her own weak bet as a risk', () => {
    const played = deal('7c 2d', 'Ah Kd', 'Qs Jh 8d 4c 9h');
    played.act(call, 500);
    played.act(raiseTo(60), 1000);
    const [bet] = entries(played.persona, 'ownMove');
    expect(bet?.event).toMatchObject({ kind: 'ownMove', move: 'bet', amountBb: 2 });
    expect(bet?.impulses.some((i) => i.emotion === 'fear')).toBe(true);
  });

  it('is angered to fold a strong hand to his bet', () => {
    const played = deal('Kh Qd', '7c 6c', 'Kc 8d 4s 2h 3c');
    [call, check, check, raiseTo(40)].forEach((action, k) => played.act(action, (k + 1) * 500));
    played.act({ kind: 'fold' }, 3000);
    const [fold] = entries(played.persona, 'ownMove');
    expect(fold?.event).toMatchObject({ kind: 'ownMove', move: 'fold', facingBb: 2 });
    expect(fold?.impulses.some((i) => i.emotion === 'anger')).toBe(true);
  });

  it('feels a lost river call with a weak hand as a mistake', () => {
    const played = deal('7c 2d', 'Ah Kd', 'Qs Jh 8d 4c 9h');
    [call, check, check, check, check, check, check, raiseTo(60)].forEach((action, k) =>
      played.act(action, (k + 1) * 500),
    );
    played.act(call, 5000);
    expect(entries(played.persona, 'mistake')[0]?.event).toEqual({ kind: 'mistake', costBb: 3 });
  });

  it('folds to what she has left to call after his re-raise', () => {
    const played = deal('Kh Qd', '7c 6c', 'Kc 8d 4s 2h 3c');
    [call, check, raiseTo(40), raiseTo(120)].forEach((action, k) =>
      played.act(action, (k + 1) * 500),
    );
    played.act({ kind: 'fold' }, 3000);
    expect(entries(played.persona, 'ownMove')[0]?.event).toMatchObject({
      move: 'fold',
      facingBb: 4,
    });
  });

  it('folds to the bet of this street only', () => {
    const played = deal('Kh Qd', '7c 6c', 'Kc 8d 4s 2h 3c');
    [call, check, check, raiseTo(40), call, check, raiseTo(60)].forEach((action, k) =>
      played.act(action, (k + 1) * 500),
    );
    played.act({ kind: 'fold' }, 4000);
    expect(entries(played.persona, 'ownMove')[0]?.event).toMatchObject({
      move: 'fold',
      facingBb: 3,
    });
  });

  it('sees no mistake in a weak river call that wins or a strong one that loses', () => {
    const river = [call, check, check, check, check, check, check, raiseTo(60)];
    const weakWins = deal('7c 2d', '5c 3d', 'Qs Jh 8d 4c 9h');
    const strongLoses = deal('As Ah', '9s 9h', 'Kc 9d 2s 3h Qh');
    for (const played of [weakWins, strongLoses]) {
      river.forEach((action, k) => played.act(action, (k + 1) * 500));
      played.act(call, 5000);
      expect(entries(played.persona, 'mistake')).toEqual([]);
    }
  });
});
