import { describe, expect, it } from 'vitest';
import { CASH } from '../engine/index.ts';
import { createSession } from './session.ts';
import type { Session } from './session.ts';
import { shovingBot } from './testBot.ts';
import { toViewModel } from './viewModel.ts';
import { initialFace, sessionFace } from './sessionFace.ts';
import { createPersona } from '../persona/index.ts';
import { mulberry32 } from '../cards/index.ts';

interface Table {
  session: Session;
  tick(ms?: number): void;
}

function open(faceOn?: boolean): Table {
  let clock = 0;
  const session = createSession({
    bot: shovingBot(),
    seed: 7,
    botDelayMs: 0,
    humanSeat: 1,
    names: ['Mallorca', 'You'],
    mode: CASH,
    now: () => clock,
    ...(faceOn === undefined ? {} : { faceOn }),
  });
  return { session, tick: (ms = 10_000) => (clock += ms) };
}

async function playHands(table: Table, hands: number): Promise<void> {
  for (let i = 0; i < hands; i += 1) {
    await table.session.getState().act({ kind: 'passive' });
    table.tick();
    if (table.session.getState().phase === 'handOver') {
      await table.session.getState().nextHand();
    }
  }
}

describe('her face in the session', () => {
  it('has no frame before the start and a frame against the math bot after it', async () => {
    const table = open();
    expect(table.session.getState().faceNow()).toBeNull();
    await table.session.getState().start();
    const frame = table.session.getState().faceNow();
    expect(frame).not.toBeNull();
    expect(frame?.idle.blinkRate).toBeGreaterThan(0);
    expect(table.session.getState().face.on).toBe(true);
  });

  it('adds gaze cues and reactions with increasing ids, keeping the last 24', async () => {
    const table = open();
    await table.session.getState().start();
    await playHands(table, 20);
    const { cues } = table.session.getState().face;
    expect(cues.length).toBeGreaterThan(0);
    expect(cues.length).toBeLessThanOrEqual(24);
    expect(cues.some((c) => c.kind === 'gaze')).toBe(true);
    expect(cues.some((c) => c.kind === 'pulse')).toBe(true);
    const ids = cues.map((c) => c.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shows nothing while off and replays no old reaction when switched on', async () => {
    const table = open(false);
    await table.session.getState().start();
    await playHands(table, 6);
    expect(table.session.getState().faceNow()).toBeNull();
    expect(table.session.getState().face).toEqual({ on: false, cues: [] });
    table.session.getState().setFace(true);
    expect(table.session.getState().faceNow()).not.toBeNull();
    expect(table.session.getState().face.cues).toEqual([]);
  });

  it('a face switched off and on mid-hand shows no old pulse', async () => {
    const steady = open();
    const toggled = open();
    await steady.session.getState().start();
    await toggled.session.getState().start();
    await playHands(steady, 3);
    await playHands(toggled, 3);
    toggled.session.getState().setFace(false);
    await playHands(steady, 6);
    await playHands(toggled, 6);
    toggled.session.getState().setFace(true);
    const lastId = (t: Table) => t.session.getState().face.cues.at(-1)?.id ?? 0;
    const since = [lastId(steady), lastId(toggled)] as const;
    await playHands(steady, 1);
    await playHands(toggled, 1);
    const fresh = (t: Table, id: number) =>
      t.session
        .getState()
        .face.cues.filter((c) => c.id > id)
        .map(({ id: _id, ...cue }) => cue);
    expect(fresh(toggled, since[1])).toEqual(fresh(steady, since[0]));
  });

  it('puts the switch and the cues in the view model', async () => {
    const table = open();
    await table.session.getState().start();
    const vm = toViewModel(table.session.getState(), 1);
    expect(vm.face.on).toBe(true);
    expect(vm.face.cues).toBe(table.session.getState().face.cues);
  });

  it('reads a new persona from its first entry', () => {
    const old = createPersona({ seat: 0, rng: mulberry32(1) });
    for (let k = 0; k < 20; k += 1) old.hear(['friendly']);
    const next = createPersona({ seat: 0, rng: mulberry32(2) });
    let current = old;
    let face = initialFace(true);
    const watcher = sessionFace({
      read: () => face,
      write: (f) => {
        face = f;
      },
      persona: () => current,
      now: () => 0,
      botSeat: 0,
    });
    watcher.observe([]);
    current = next;
    next.hear(['mockBluff', 'mockBluff']);
    watcher.observe([]);
    expect(face.cues.some((c) => c.kind === 'pulse')).toBe(true);
  });

  it('reads the face ahead in time without changing her feeling', async () => {
    const table = open();
    await table.session.getState().start();
    await playHands(table, 3);
    const first = table.session.getState().faceNow();
    table.tick(60_000);
    table.session.getState().faceNow();
    table.tick(-60_000);
    expect(table.session.getState().faceNow()).toEqual(first);
  });
});
