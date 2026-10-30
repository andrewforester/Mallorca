import { act, cleanup, renderHook } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSweep } from './useSweep.ts';

type Props = { bets: [number, number]; collected: number };

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(initial: Props) {
  return renderHook((props: Props) => useSweep(props.bets, props.collected), {
    initialProps: initial,
  });
}

describe('useSweep', () => {
  it('returns the bets while they stand', () => {
    const { result } = setup({ bets: [60, 60], collected: 0 });
    expect(result.current).toEqual([60, 60]);
  });

  it('keeps the previous bets for 300 ms when the street closes, then clears them', () => {
    const { result, rerender } = setup({ bets: [60, 60], collected: 0 });
    rerender({ bets: [0, 0], collected: 120 });
    expect(result.current).toEqual([60, 60]);
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toEqual([60, 60]);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toEqual([0, 0]);
  });

  it('clears at once when a new hand starts and collected resets', () => {
    const { result, rerender } = setup({ bets: [60, 60], collected: 120 });
    rerender({ bets: [0, 0], collected: 0 });
    expect(result.current).toEqual([0, 0]);
  });

  it('shows new bets at once even during a sweep', () => {
    const { result, rerender } = setup({ bets: [60, 60], collected: 0 });
    rerender({ bets: [0, 0], collected: 120 });
    rerender({ bets: [20, 0], collected: 120 });
    expect(result.current).toEqual([20, 0]);
  });

  it('splits the collected chips evenly when the closing call never rendered', () => {
    const { result, rerender } = setup({ bets: [60, 20], collected: 0 });
    rerender({ bets: [0, 0], collected: 120 });
    expect(result.current).toEqual([60, 60]);
  });

  it('does not sweep when the bets drop while collected stays the same', () => {
    const { result, rerender } = setup({ bets: [60, 20], collected: 40 });
    rerender({ bets: [0, 0], collected: 40 });
    expect(result.current).toEqual([0, 0]);
  });
});
