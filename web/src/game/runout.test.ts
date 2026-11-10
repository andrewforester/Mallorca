import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOURNAMENT } from '../engine/index.ts';
import type { BotClient } from './botClient.ts';
import { RUNOUT_MS } from './runout.ts';
import { createSession } from './session.ts';
import type { Session } from './session.ts';
import { callingBot } from './testBot.ts';
import { toViewModel } from './viewModel.ts';

const BOT_DELAY_MS = 700;

function open(bot: BotClient, botDelayMs: number): Session {
  return createSession({
    bot,
    seed: 7,
    botDelayMs,
    humanSeat: 1,
    names: ['Mallorca', 'You'],
    mode: TOURNAMENT,
  });
}

async function shoveAndGetCalled(session: Session): Promise<{ acted: Promise<void> }> {
  const started = session.getState().start();
  await vi.advanceTimersByTimeAsync(BOT_DELAY_MS);
  await started;
  const acted = session.getState().act({ kind: 'raise', to: 2000 });
  await vi.advanceTimersByTimeAsync(BOT_DELAY_MS);
  return { acted };
}

function boardOf(session: Session): number {
  return session.getState().table.hand?.board.length ?? 0;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('all-in run-out', () => {
  it('deals the flop, the turn and the river one at a time before the result', async () => {
    vi.useFakeTimers();
    const session = open(callingBot(), BOT_DELAY_MS);
    const { acted } = await shoveAndGetCalled(session);
    expect(boardOf(session)).toBe(3);
    expect(session.getState().phase).toBe('animating');
    expect(session.getState().result).toBeNull();
    await vi.advanceTimersByTimeAsync(RUNOUT_MS);
    expect(boardOf(session)).toBe(4);
    await vi.advanceTimersByTimeAsync(RUNOUT_MS - 1);
    expect(boardOf(session)).toBe(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(boardOf(session)).toBe(5);
    expect(session.getState().result).toBeNull();
    await vi.advanceTimersByTimeAsync(RUNOUT_MS);
    await acted;
    expect(session.getState().result).not.toBeNull();
    expect(['handOver', 'tournamentOver']).toContain(session.getState().phase);
  });

  it('keeps both stacks empty and the pot whole while the board runs out', async () => {
    vi.useFakeTimers();
    const session = open(callingBot(), BOT_DELAY_MS);
    await shoveAndGetCalled(session);
    const vm = toViewModel(session.getState(), 1);
    expect(vm.seats.map((seat) => seat.stack)).toEqual([0, 0]);
    expect(vm.pot).toEqual({ collected: 4000, total: 4000 });
    expect(vm.controls.enabled).toBe(false);
    expect(session.getState().table.winner).toBeNull();
  });

  it('turns her cards face up while the board runs out', async () => {
    vi.useFakeTimers();
    const session = open(callingBot(), BOT_DELAY_MS);
    await shoveAndGetCalled(session);
    const vm = toViewModel(session.getState(), 1);
    expect(vm.seats[0].cards).not.toContain('back');
  });

  it('writes each street to the log as it is dealt', async () => {
    vi.useFakeTimers();
    const session = open(callingBot(), BOT_DELAY_MS);
    await shoveAndGetCalled(session);
    const streets = () =>
      session
        .getState()
        .log.map((entry) => entry.key)
        .filter((key) => ['flop', 'turn', 'river'].includes(key));
    expect(streets()).toEqual(['flop']);
    await vi.advanceTimersByTimeAsync(RUNOUT_MS);
    expect(streets()).toEqual(['flop', 'turn']);
  });

  it('stops when the session is disposed', async () => {
    vi.useFakeTimers();
    const session = open(callingBot(), BOT_DELAY_MS);
    const { acted } = await shoveAndGetCalled(session);
    session.getState().dispose();
    await vi.advanceTimersByTimeAsync(RUNOUT_MS * 3);
    await acted;
    expect(boardOf(session)).toBe(3);
    expect(session.getState().result).toBeNull();
  });

  it('shows the whole board at once without a bot delay', async () => {
    const session = open(callingBot(), 0);
    await session.getState().start();
    await session.getState().act({ kind: 'raise', to: 2000 });
    expect(boardOf(session)).toBe(5);
    expect(session.getState().result).not.toBeNull();
  });
});
