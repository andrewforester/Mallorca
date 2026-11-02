import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../cards/index.ts';
import type { Rng } from '../cards/index.ts';
import { createPersona } from '../persona/index.ts';
import type { PersonaView, Presenting } from '../persona/index.ts';
import { NO_HAND } from '../persona/hand.ts';
import { PACE_MS, judge, streetKey } from './verdict.ts';
import type { Pace } from './verdict.ts';
import type { Occasion, OccasionKind } from './types.ts';

const rolls = (...values: number[]): Rng => {
  let k = 0;
  return {
    next: () => {
      const v = values[k];
      k += 1;
      if (v === undefined) {
        throw new Error('no more rolls');
      }
      return v;
    },
  };
};

function view(patch: Partial<PersonaView> = {}): PersonaView {
  const base = createPersona({ seat: 1, rng: mulberry32(1) }).view(0);
  return { ...base, mask: 0, speakFactor: 1, presenting: null, stance: null, ...patch };
}

function occasion(kind: OccasionKind, patch: Partial<Occasion> = {}): Occasion {
  return {
    kind,
    end: kind === 'handEnded' ? 'won' : null,
    impulses: [],
    journalIds: [],
    handNumber: 3,
    street: 'flop',
    actionStreet: 'flop',
    strength: 'medium',
    endsHand: kind === 'handEnded',
    hand: NO_HAND,
    text: kind === 'playerSaid' ? 'hi' : null,
    previous: null,
    ...patch,
  };
}

const FRESH: Pace = { lastLineAt: Number.NEGATIVE_INFINITY, usedStreets: new Set() };

describe('the verdict', () => {
  it(`waits ${PACE_MS} ms after her last line`, () => {
    const pace: Pace = { lastLineAt: 1000, usedStreets: new Set() };
    const early = judge(
      { occasions: [occasion('herCall')], view: view(), pace, nowMs: 2499 },
      rolls(),
    );
    expect(early[0]).toMatchObject({ speak: false, reason: 'pace', sinceLastMs: 1499, roll: null });
    const late = judge(
      { occasions: [occasion('herCall')], view: view(), pace, nowMs: 2500 },
      rolls(0, 0.9),
    );
    expect(late[0]?.speak).toBe(true);
  });

  it('speaks once a street, but always at the end of a hand', () => {
    const pace: Pace = { lastLineAt: 0, usedStreets: new Set([streetKey(3, 'flop')]) };
    const call = judge(
      { occasions: [occasion('herCall')], view: view(), pace, nowMs: 9000 },
      rolls(),
    );
    expect(call[0]?.reason).toBe('street');
    const end = judge(
      { occasions: [occasion('handEnded')], view: view(), pace, nowMs: 9000 },
      rolls(0),
    );
    expect(end[0]?.speak).toBe(true);
  });

  it('draws against the chance times her urge to speak', () => {
    const input = (roll: number) =>
      judge(
        {
          occasions: [occasion('herFold', { strength: 'weak' })],
          view: view(),
          pace: FRESH,
          nowMs: 0,
        },
        rolls(roll),
      )[0];
    expect(input(0.14)?.speak).toBe(true);
    expect(input(0.15)).toMatchObject({ speak: false, reason: 'roll', roll: 0.15 });
    const urged = judge(
      {
        occasions: [occasion('playerRaise', { strength: 'weak' })],
        view: view({ speakFactor: 1.2 }),
        pace: FRESH,
        nowMs: 0,
      },
      rolls(0.35, 0.9),
    )[0];
    expect(urged?.chance).toEqual({ base: 0.3, masked: 0.3, speakFactor: 1.2, final: 0.36 });
    expect(urged?.speak).toBe(true);
  });

  it('lets the newest occasion speak and supersedes the older ones', () => {
    const verdicts = judge(
      {
        occasions: [occasion('herCall'), occasion('handEnded')],
        view: view(),
        pace: FRESH,
        nowMs: 0,
      },
      rolls(0),
    );
    expect(verdicts.map((v) => [v.occasion.kind, v.speak, v.reason, v.roll])).toEqual([
      ['handEnded', true, null, 0],
      ['herCall', false, 'superseded', null],
    ]);
  });

  it('falls back to an older occasion when the newest has no rule', () => {
    const verdicts = judge(
      { occasions: [occasion('herCall'), occasion('card')], view: view(), pace: FRESH, nowMs: 0 },
      rolls(0, 0.9),
    );
    expect(verdicts.map((v) => v.reason)).toEqual(['noRule', null]);
  });

  it('answers the player at once on any street', () => {
    const pace: Pace = { lastLineAt: 0, usedStreets: new Set([streetKey(3, 'flop')]) };
    const said = judge(
      { occasions: [occasion('playerSaid')], view: view(), pace, nowMs: 1 },
      rolls(0, 0.9),
    );
    expect(said[0]).toMatchObject({ speak: true, act: 'answer' });
  });

  it('tells the truth about her hand behind no mask', () => {
    const v = judge(
      {
        occasions: [occasion('herBet', { strength: 'weak' })],
        view: view(),
        pace: FRESH,
        nowMs: 0,
      },
      rolls(0, 0.5, 0.99),
    )[0];
    expect(v?.claim).toEqual({ rolls: [0.5, 0.99], claim: { about: 'weak', honest: true } });
    expect(v?.act).toBe('claim');
  });

  it('claims what she acts behind a full mask', () => {
    const presenting: Presenting = { stance: 'bluff', shows: 'strong', effort: 0.6 };
    const v = judge(
      {
        occasions: [occasion('herBet', { strength: 'weak' })],
        view: view({ mask: 1, presenting, stance: 'bluff' }),
        pace: FRESH,
        nowMs: 0,
      },
      rolls(0, 0.5, 0.2),
    )[0];
    expect(v?.claim?.claim).toEqual({ about: 'strong', honest: false });
  });

  it('claims nothing behind a full mask when she acts nothing, and keeps the act', () => {
    const v = judge(
      {
        occasions: [occasion('herBet', { strength: 'weak' })],
        view: view({ mask: 1 }),
        pace: FRESH,
        nowMs: 0,
      },
      rolls(0, 0.5, 0.2),
    )[0];
    expect(v?.claim?.claim).toBeNull();
    expect(v?.act).toBe('press');
  });

  it('skips the claim at a rate of 0.7', () => {
    const v = judge(
      {
        occasions: [occasion('herBet', { strength: 'weak' })],
        view: view(),
        pace: FRESH,
        nowMs: 0,
      },
      rolls(0, 0.7),
    )[0];
    expect(v?.claim).toEqual({ rolls: [0.7], claim: null });
  });

  it('claims nothing in an answer after the hand ended', () => {
    const v = judge(
      {
        occasions: [occasion('playerSaid', { previous: 'handEnded' })],
        view: view(),
        pace: FRESH,
        nowMs: 0,
      },
      rolls(0),
    )[0];
    expect(v?.claim).toBeNull();
    expect(v?.act).toBe('answer');
  });

  it('lets nothing of a step speak before its hand end', () => {
    const verdicts = judge(
      {
        occasions: [occasion('herCall'), occasion('handEnded')],
        view: view(),
        pace: FRESH,
        nowMs: 0,
      },
      rolls(0.99),
    );
    expect(verdicts.map((v) => [v.occasion.kind, v.reason, v.roll])).toEqual([
      ['handEnded', 'roll', 0.99],
      ['herCall', 'superseded', null],
    ]);
  });
});
