import { describe, expect, it } from 'vitest';
import type { TableEvent } from './appraisal.ts';
import { BIAS_KEYS } from './biasKeys.ts';
import type { PlayBias } from './biasKeys.ts';
import { createEngine } from './engine.ts';
import type { Engine } from './engine.ts';
import { PERSONALITIES } from './profiles.ts';
import type { PersonalityKey } from './profiles.ts';

type Beat = TableEvent | { wait: number };

const STEP = 0.25;

const deal = (equity: number, potBb = 3): TableEvent => ({
  kind: 'deal',
  equity,
  potBb,
  investedBb: potBb / 2,
  stackBb: 100,
  streetsLeft: 3,
});

const street = (equity: number, potBb: number, streetsLeft: number): TableEvent => ({
  kind: 'street',
  equity,
  potBb,
  investedBb: potBb / 2,
  stackBb: 100 - potBb / 2,
  streetsLeft,
});

const result = (netBb: number): TableEvent => ({ kind: 'result', netBb });

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
    ? [
        deal(0.35, 1.5),
        { wait: 5 },
        { kind: 'ownMove', move: 'fold', facingBb: 1, equity: 0.35 },
        result(-0.5),
        { wait: 14 },
      ]
    : [deal(0.45, 1.5), { wait: 5 }, result(0.5), { wait: 14 }];

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

const HEATER: Beat[] = [
  ...[0, 1, 2].flatMap((): Beat[] => [
    deal(0.6),
    { wait: 4 },
    street(0.65, 60, 1),
    { wait: 4 },
    result(40),
    { wait: 10 },
  ]),
  ...[0, 1].flatMap((): Beat[] => [{ kind: 'bluff', succeeded: true, potBb: 20 }, { wait: 10 }]),
  deal(0.4),
  { wait: 4 },
  street(0.2, 120, 0),
  { wait: 2 },
  result(60),
  { wait: 2 },
  { kind: 'chat', signal: 'compliment' },
  { wait: 4 },
];

const CHARACTERS = Object.keys(PERSONALITIES).filter((k) => k !== 'neutral') as PersonalityKey[];

interface Run {
  engine: Engine;
  styles: PlayBias[];
}

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
  styles: PlayBias[];
}

const createRun = (key: PersonalityKey): Run => ({
  engine: createEngine(PERSONALITIES[key]),
  styles: [],
});

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
  const heater = play(createRun(key), HEATER);
  return { rest, badBeat, losses, quiet, heater, styles: run.styles };
}

const SESSIONS = Object.fromEntries(CHARACTERS.map((k) => [k, session(k)])) as Record<
  PersonalityKey,
  Session
>;

describe('the reference session', () => {
  it('orders the characters at rest by aggression', () => {
    const order = ['rita', 'sol', 'ingrid', 'mallorca', 'vera', 'mira', 'greta', 'nina'] as const;
    const values = order.map((k) => SESSIONS[k].rest.aggression);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it('tilts each character her own way after the losses', () => {
    expect(SESSIONS.rita.losses.aggression).toBeGreaterThan(SESSIONS.rita.rest.aggression);
    for (const k of ['nina', 'vera', 'greta'] as const) {
      expect(SESSIONS[k].losses.aggression).toBeLessThan(SESSIONS[k].rest.aggression);
    }
    for (const axis of BIAS_KEYS) {
      expect(Math.abs(SESSIONS.ingrid.losses[axis] - SESSIONS.ingrid.rest[axis])).toBeLessThan(
        0.05,
      );
    }
  });

  it('brings Mallorca back toward her rest over five minutes of quiet hands', () => {
    const m = SESSIONS.mallorca;
    const away = (b: PlayBias): number =>
      BIAS_KEYS.reduce((sum, axis) => sum + Math.abs(Math.log2(b[axis] / m.rest[axis])), 0);
    expect(away(m.quiet)).toBeLessThan(away(m.losses));
    for (const axis of BIAS_KEYS) {
      expect(Math.abs(m.quiet[axis] - m.rest[axis])).toBeLessThan(0.1);
    }
  });

  it('raises everyone on a heater', () => {
    for (const k of CHARACTERS) {
      expect(SESSIONS[k].heater.aggression).toBeGreaterThan(SESSIONS[k].rest.aggression);
    }
  });

  it('keeps every style strictly inside the range at every step', () => {
    for (const k of CHARACTERS) {
      for (const style of SESSIONS[k].styles) {
        for (const axis of BIAS_KEYS) {
          expect(style[axis]).toBeGreaterThan(0.5);
          expect(style[axis]).toBeLessThan(2);
        }
      }
    }
  });
});
