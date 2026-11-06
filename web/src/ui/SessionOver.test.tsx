import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CASH, memoryStore } from '../game/index.ts';
import type { HandRecord } from '../game/index.ts';
import { SessionOver } from './SessionOver.tsx';

const download = vi.hoisted(() => vi.fn());
vi.mock('./download.ts', () => ({ download }));

afterEach(() => {
  cleanup();
  download.mockClear();
});

function sample(sessionId: string, handNumber: number): HandRecord {
  return {
    version: 1,
    id: `${sessionId}-${handNumber}`,
    sessionId,
    mode: CASH,
    handNumber,
    playedAt: '2026-10-23T10:00:00.000Z',
    names: ['You', 'Bot'],
    humanSeat: 0,
    bot: { id: 'math', version: '1' },
    holeCards: [
      ['Ah', 'Kd'],
      ['Qc', 'Qd'],
    ],
    board: [],
    events: [],
    decisions: [],
  };
}

function over(hands: number, netBb: number, bbPer100: number | null, sessionId = 'abc') {
  const store = memoryStore();
  render(
    <SessionOver
      session={{ hands, netBb, bbPer100 }}
      store={store}
      sessionId={sessionId}
      onPlayAgain={vi.fn()}
      onLeave={vi.fn()}
    />,
  );
  return store;
}

describe('SessionOver', () => {
  it('shows the result large, then the hands and the rate, and thanks for the company', () => {
    const onPlayAgain = vi.fn();
    const onLeave = vi.fn();
    render(
      <SessionOver
        session={{ hands: 7, netBb: -4.5, bbPer100: -64.3 }}
        store={memoryStore()}
        sessionId="abc"
        onPlayAgain={onPlayAgain}
        onLeave={onLeave}
      />,
    );
    const dialog = screen.getByTestId('session-over');
    expect(dialog.textContent).toContain('Session over');
    expect(dialog.textContent).toContain('Thank you for the company.');
    expect(screen.getByTestId('session-summary').textContent).toBe('-4.5 bb');
    expect(screen.getByTestId('session-hands').textContent).toBe('7 hands');
    expect(screen.getByTestId('session-rate').textContent).toBe('-64.3 bb/100');
    fireEvent.click(screen.getByTestId('play-again'));
    fireEvent.click(screen.getByTestId('leave-tonight'));
    expect(onPlayAgain).toHaveBeenCalledOnce();
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('gives Play again and the way out equal weight', () => {
    over(1, 2, 200);
    expect(screen.getByTestId('play-again').className).toBe(
      screen.getByTestId('leave-tonight').className,
    );
  });

  it('omits the rate with no hands', () => {
    over(0, 0, null);
    expect(screen.getByTestId('session-summary').textContent).toBe('0.0 bb');
    expect(screen.getByTestId('session-hands').textContent).toBe('0 hands');
    expect(screen.queryByTestId('session-rate')).toBeNull();
  });

  it('uses the singular for one hand', () => {
    over(1, 2, 200);
    expect(screen.getByTestId('session-summary').textContent).toBe('+2.0 bb');
    expect(screen.getByTestId('session-hands').textContent).toBe('1 hand');
  });

  it('exports the records of the session as json and as text', async () => {
    const store = over(1, 0, 0, 's-1');
    await store.add(sample('s-1', 1));
    await store.add(sample('other', 1));
    fireEvent.click(screen.getByTestId('export-json'));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(download.mock.calls[0]?.[0]).toBe('mallorca-s-1.json');
    expect(download.mock.calls[0]?.[2]).toBe('application/json');
    expect(JSON.parse(download.mock.calls[0]?.[1] as string)).toHaveLength(1);
    fireEvent.click(screen.getByTestId('export-text'));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
    expect(download.mock.calls[1]?.[0]).toBe('mallorca-s-1.txt');
    expect(download.mock.calls[1]?.[2]).toBe('text/plain');
  });
});
