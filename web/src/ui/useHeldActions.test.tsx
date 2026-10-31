import { act, cleanup, renderHook } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry } from '../game/index.ts';
import { useHeldActions } from './useHeldActions.ts';

type Actions = [LogEntry | null, LogEntry | null];
type Props = { actions: Actions; closing: Actions; board: number };

const NONE: Actions = [null, null];
const CALL: LogEntry = { key: 'call', params: { amount: 80 } };
const BET: LogEntry = { key: 'bet', params: { amount: 80 } };
const CHECK: LogEntry = { key: 'check', params: {} };

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(initial: Props) {
  return renderHook((props: Props) => useHeldActions(props.actions, props.closing, props.board), {
    initialProps: initial,
  });
}

describe('useHeldActions', () => {
  it('returns the current actions while the street goes on', () => {
    const { result } = setup({ actions: [null, BET], closing: NONE, board: 3 });
    expect(result.current).toEqual({ actions: [null, BET], holding: false });
  });

  it('keeps the closing actions for 900 ms after a street is dealt, then clears them', () => {
    const { result, rerender } = setup({ actions: [null, BET], closing: NONE, board: 3 });
    rerender({ actions: NONE, closing: [CALL, BET], board: 4 });
    expect(result.current).toEqual({ actions: [CALL, BET], holding: true });
    act(() => {
      vi.advanceTimersByTime(899);
    });
    expect(result.current).toEqual({ actions: [CALL, BET], holding: true });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toEqual({ actions: NONE, holding: false });
  });

  it('clears at once when a new hand starts', () => {
    const { result, rerender } = setup({ actions: [CALL, BET], closing: NONE, board: 5 });
    rerender({ actions: NONE, closing: NONE, board: 0 });
    expect(result.current).toEqual({ actions: NONE, holding: false });
  });

  it('shows a new action at once during a hold', () => {
    const { result, rerender } = setup({ actions: [null, BET], closing: NONE, board: 3 });
    rerender({ actions: NONE, closing: [CALL, BET], board: 4 });
    rerender({ actions: [null, CHECK], closing: [CALL, BET], board: 4 });
    expect(result.current).toEqual({ actions: [null, CHECK], holding: false });
  });
});
