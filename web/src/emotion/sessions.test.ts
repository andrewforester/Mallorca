import { describe, expect, it } from 'vitest';
import type { Cause, Decided, TableEvent } from './appraisal.ts';
import { BIAS_KEYS } from './biasKeys.ts';
import type { BiasKey, PlayBias } from './biasKeys.ts';
import { createEngine } from './engine.ts';
import type { Engine } from './engine.ts';
import { PERSONALITIES } from './profiles.ts';
import type { PersonalityKey } from './profiles.ts';

type Beat = TableEvent | { wait: number };

const STEP = 0.25;

const deal = (equity: number, potBb = 3, streetsLeft = 3): TableEvent => ({
  kind: 'deal',
  equity,
  potBb,
  investedBb: potBb / 2,
  stackBb: 100,
  streetsLeft,
});

const street = (
  equity: number,
  potBb: number,
  streetsLeft: number,
  cause: Cause = 'cards',
): TableEvent => ({
  kind: 'street',
  equity,
  cause,
  potBb,
  investedBb: potBb / 2,
  stackBb: 100 - potBb / 2,
  streetsLeft,
});

const result = (netBb: number, decided: Decided = 'showdown', lastEquity?: number): TableEvent => ({
  kind: 'result',
  netBb,
  decided,
  ...(lastEquity === undefined ? {} : { lastEquity }),
});

const calmHand = (i: number): Beat[] => [
  deal(0.48 + 0.01 * (i % 3)),
  { wait: 6 },
  street(0.5 + 0.02 * ((i % 2) * 2 - 1), 4, 2),
  { wait: 6 },
  result(i % 2 === 0 ? 1.5 : -1.5),
  { wait: 8 },
];

const quietHand = (i: number): Beat[] =>
  i % 2 === 0
    ? [deal(0.35, 1.5), { wait: 5 }, result(-0.5, 'sheFolded'), { wait: 14 }]
    : [deal(0.45, 1.5), { wait: 5 }, result(0.5, 'heFolded'), { wait: 14 }];

const BAD_BEAT: Beat[] = [
  deal(0.8),
  { wait: 4 },
  street(0.91, 200, 1),
  { wait: 4 },
  street(0, 200, 0),
  { wait: 1 },
  result(-100),
];

const LOSS_TO_A_RAISE: Beat[] = [
  deal(0.5),
  { wait: 4 },
  { kind: 'opponentBet', sizeBb: 12, equity: 0.45, raise: true },
  { wait: 4 },
  result(-12),
  { wait: 12 },
];

const COOLER: Beat[] = [
  deal(0.75),
  { wait: 4 },
  street(0.7, 80, 1),
  { wait: 4 },
  { kind: 'opponentBet', sizeBb: 30, equity: 0.7, raise: true },
  { wait: 4 },
  result(-40),
  { wait: 12 },
];

const riverBluff = (called: boolean): Beat[] => [
  deal(0.1, 20, 0),
  { wait: 4 },
  { kind: 'ownMove', move: 'bet', amountBb: 15, potBb: 20, equity: 0.1 },
  { wait: 4 },
  ...(called
    ? [{ kind: 'opponentCall' } as const, { wait: 1 }, result(-25)]
    : [result(20, 'heFolded')]),
];

const HEATER: Beat[] = [
  ...[0, 1, 2].flatMap((): Beat[] => [
    deal(0.6),
    { wait: 4 },
    street(0.65, 60, 1),
    { wait: 4 },
    result(40),
    { wait: 10 },
  ]),
  ...[0, 1].flatMap((): Beat[] => [...riverBluff(false), { wait: 10 }]),
  deal(0.4),
  { wait: 4 },
  street(0.2, 120, 0),
  { wait: 2 },
  result(60),
  { wait: 2 },
  { kind: 'chat', signal: 'compliment' },
  { wait: 4 },
];

const KEYS = [
  'mallorca',
  'ingrid',
  'sol',
  'rita',
  'vera',
  'nina',
  'mira',
  'lola',
  'greta',
  'neutral',
] as const;

interface Run {
  engine: Engine;
  styles: PlayBias[];
}

const createRun = (key: PersonalityKey): Run => ({
  engine: createEngine(PERSONALITIES[key]),
  styles: [],
});

function play(run: Run, beats: readonly Beat[]): PlayBias {
  for (const beat of beats) {
    if ('wait' in beat) {
      for (let t = 0; t < beat.wait; t += STEP) {
        run.engine.step(STEP);
        run.styles.push(run.engine.snapshot().bias);
      }
    } else {
      run.engine.event(beat);
    }
  }
  return run.engine.snapshot().bias;
}

interface Session {
  rest: PlayBias;
  badBeat: PlayBias;
  losses: PlayBias;
  quiet: PlayBias;
  heater: PlayBias;
  caught: PlayBias;
  through: PlayBias;
  styles: PlayBias[];
}

function session(key: PersonalityKey): Session {
  const run = createRun(key);
  const rest = run.engine.snapshot().bias;
  play(run, [0, 1, 2, 3, 4, 5].flatMap(calmHand));
  const badBeat = play(run, [...BAD_BEAT, { wait: 15 }]);
  const losses = play(run, [
    ...LOSS_TO_A_RAISE,
    ...LOSS_TO_A_RAISE,
    ...LOSS_TO_A_RAISE,
    ...LOSS_TO_A_RAISE,
    ...COOLER,
  ]);
  const quiet = play(run, Array.from({ length: 16 }, (_, i) => quietHand(i)).flat());
  const side = [createRun(key), createRun(key), createRun(key)];
  const heater = play(side[0]!, HEATER);
  const caught = play(side[1]!, [...riverBluff(true), { wait: 15 }]);
  const through = play(side[2]!, [...riverBluff(false), { wait: 15 }]);
  const styles = [run, ...side].flatMap((r) => r.styles);
  return { rest, badBeat, losses, quiet, heater, caught, through, styles };
}

const SESSIONS = Object.fromEntries(KEYS.map((k) => [k, session(k)])) as Record<
  (typeof KEYS)[number],
  Session
>;

const above = (s: Session, column: keyof Session, axis: BiasKey): boolean =>
  (s[column] as PlayBias)[axis] > s.rest[axis];

describe('the reference session of the addendum', () => {
  it('orders the characters at rest by aggression', () => {
    const order = ['rita', 'sol', 'lola', 'mallorca', 'ingrid', 'nina', 'greta'] as const;
    const values = order.map((k) => SESSIONS[k].rest.aggression);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it('tilts each character her own way after the losses', () => {
    expect(above(SESSIONS.rita, 'losses', 'aggression')).toBe(true);
    for (const k of ['nina', 'greta', 'mira', 'vera'] as const) {
      expect(above(SESSIONS[k], 'losses', 'aggression')).toBe(false);
    }
  });

  it('barely moves Ingrid at any moment, while Lola swings', () => {
    expect(
      Math.abs(SESSIONS.lola.caught.aggression - SESSIONS.lola.rest.aggression),
    ).toBeGreaterThan(0.5);
    const s = SESSIONS.ingrid;
    for (const column of ['badBeat', 'losses', 'quiet', 'heater', 'caught', 'through'] as const) {
      for (const axis of BIAS_KEYS) {
        expect(Math.abs(s[column][axis] - s.rest[axis])).toBeLessThan(0.1);
      }
    }
  });

  it('brings the average character back near rest after five quiet minutes', () => {
    for (const axis of BIAS_KEYS) {
      expect(Math.abs(SESSIONS.neutral.quiet[axis] - SESSIONS.neutral.rest[axis])).toBeLessThan(
        0.15,
      );
    }
  });

  it('raises every axis but looseness on a heater, for everyone', () => {
    for (const k of KEYS) {
      for (const axis of ['aggression', 'bluff', 'sizing', 'stickiness'] as const) {
        expect(above(SESSIONS[k], 'heater', axis)).toBe(true);
      }
    }
  });

  it('swings Lola: more bluff after a bad beat and after a bluff that got through', () => {
    expect(above(SESSIONS.lola, 'badBeat', 'bluff')).toBe(true);
    expect(above(SESSIONS.lola, 'through', 'bluff')).toBe(true);
  });

  it('keeps Rita bluffing after a caught bluff and stops Mira, Nina and Greta', () => {
    expect(SESSIONS.rita.caught.bluff).toBeGreaterThanOrEqual(SESSIONS.rita.rest.bluff);
    for (const k of ['mira', 'nina', 'greta'] as const) {
      expect(above(SESSIONS[k], 'caught', 'bluff')).toBe(false);
    }
  });

  it('keeps every value strictly inside the range at every step', () => {
    for (const k of KEYS) {
      for (const style of SESSIONS[k].styles) {
        for (const axis of BIAS_KEYS) {
          expect(style[axis]).toBeGreaterThan(0.5);
          expect(style[axis]).toBeLessThan(2);
        }
      }
    }
  });
});

const raised = (equity: number): Beat[] => [
  deal(equity, 1.5),
  { wait: 3 },
  { kind: 'ownMove', move: 'bet', amountBb: 2, potBb: 1.5, equity },
  { wait: 2 },
  { kind: 'opponentBet', sizeBb: 5.6, equity, raise: true },
  street(equity - 0.06, 8, 3, 'opponent'),
  { wait: 4 },
];

const bigWin = (netBb: number): Beat[] => [
  ...raised(0.62),
  { kind: 'opponentCall' },
  street(0.8, 12, 2),
  { wait: 5 },
  { kind: 'opponentBet', sizeBb: 10, equity: 0.8 },
  { wait: 5 },
  street(0.85, 60, 1),
  { wait: 5 },
  { kind: 'opponentBet', sizeBb: 40, equity: 0.85, raise: true },
  { wait: 4 },
  result(netBb, 'showdown', 0.85),
];

const caughtBluff = (netBb: number): Beat[] => [
  ...raised(0.3),
  { kind: 'opponentCall' },
  street(0.15, 12, 2),
  { wait: 5 },
  { kind: 'ownMove', move: 'bet', amountBb: 10, potBb: 12, equity: 0.15 },
  { kind: 'opponentCall' },
  { wait: 5 },
  street(0.02, 32, 0),
  { wait: 3 },
  { kind: 'ownMove', move: 'bet', amountBb: -netBb - 16, potBb: 32, equity: 0.02 },
  { kind: 'opponentCall' },
  { wait: 2 },
  result(netBb, 'showdown', 0.02),
];

const calledDown = (netBb: number): Beat[] => [
  ...raised(0.45),
  { kind: 'opponentCall' },
  street(0.4, 12, 2),
  { wait: 5 },
  { kind: 'opponentBet', sizeBb: 8, equity: 0.4 },
  { wait: 5 },
  result(netBb, 'showdown', 0.4),
];

type Outcome = 'fold' | 'win' | 'bigWin' | 'caught' | 'calledDown';

const AGGRESSIVE_NIGHT: readonly (readonly [Outcome, number])[] = [
  ['bigWin', 100],
  ['fold', -3],
  ['bigWin', 100],
  ['fold', -3],
  ['fold', -6],
  ['win', 8],
  ['fold', -3],
  ['caught', -111],
  ['fold', -3],
  ['fold', -6],
  ['win', 6],
  ['fold', -3],
  ['calledDown', -20],
  ['fold', -3],
  ['win', 12],
  ['fold', -6],
  ['caught', -78],
  ['fold', -3],
  ['fold', -3],
  ['win', 8],
  ['fold', -6],
  ['fold', -3],
  ['win', 15],
  ['fold', -3],
  ['caught', -188],
  ['fold', -3],
  ['fold', -3],
  ['win', 6],
  ['fold', -6],
  ['fold', -3],
  ['win', 10],
  ['fold', -3],
  ['fold', -3],
];

const handOf = (outcome: Outcome, netBb: number): Beat[] => {
  switch (outcome) {
    case 'fold':
      return [...raised(0.45), result(netBb, 'sheFolded')];
    case 'win':
      return [...raised(0.45), result(netBb, 'heFolded')];
    case 'bigWin':
      return bigWin(netBb);
    case 'caught':
      return caughtBluff(netBb);
    case 'calledDown':
      return calledDown(netBb);
  }
};

interface Night {
  rest: PlayBias;
  hands: PlayBias[];
  caught: PlayBias[];
}

function aggressiveNight(key: PersonalityKey): Night {
  const run = createRun(key);
  const rest = run.engine.snapshot().bias;
  const hands: PlayBias[] = [];
  const caught: PlayBias[] = [];
  for (const [outcome, netBb] of AGGRESSIVE_NIGHT) {
    const after = play(run, [...handOf(outcome, netBb), { wait: 5 }]);
    hands.push(after);
    if (outcome === 'caught') {
      caught.push(after);
    }
  }
  return { rest, hands, caught };
}

const NIGHTS = Object.fromEntries(KEYS.map((k) => [k, aggressiveNight(k)])) as Record<
  (typeof KEYS)[number],
  Night
>;

const meanOf = (styles: readonly PlayBias[], axis: BiasKey): number =>
  styles.reduce((sum, s) => sum + s[axis], 0) / styles.length;

describe('a night against an opponent who raises nearly every hand', () => {
  it('keeps Sol visibly below the edge, though two big wins came early', () => {
    const sol = NIGHTS.sol;
    for (const axis of ['aggression', 'sizing'] as const) {
      expect(meanOf(sol.hands, axis)).toBeLessThan(1.85);
    }
  });

  it('shows her own caught bluffs in her play: all but Rita drop below rest', () => {
    for (const k of KEYS) {
      const night = NIGHTS[k];
      for (const after of night.caught) {
        if (k === 'rita') {
          expect(after.aggression).toBeGreaterThan(night.rest.aggression);
        } else {
          expect(after.aggression).toBeLessThan(night.rest.aggression);
        }
      }
    }
  });

  it('does not anger her at his raises once the hands are over', () => {
    const sol = NIGHTS.sol;
    const folds = sol.hands.filter((_, i) => AGGRESSIVE_NIGHT[i]?.[0] === 'fold');
    expect(Math.min(...folds.map((s) => s.aggression))).toBeLessThan(sol.rest.aggression);
  });
});
