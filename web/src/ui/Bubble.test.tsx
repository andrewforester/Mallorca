import { act, cleanup, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatLine } from '../game/index.ts';
import { Bubble } from './Bubble.tsx';

function line(id: number, text: string): ChatLine {
  return { id, speaker: 'mallorca', text, handNumber: 1 };
}

function typed(): string {
  return (
    screen.getByTestId('bubble-mallorca').querySelector('.conversation-bubble-typed')
      ?.textContent ?? ''
  );
}

function reducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  reducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Bubble', () => {
  it('types the text at about 40 characters per second', () => {
    render(<Bubble line={line(1, 'Nice try, darling.')} />);
    expect(typed().length).toBeLessThan(3);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(typed().length).toBeGreaterThanOrEqual(8);
    expect(typed().length).toBeLessThanOrEqual(12);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(typed()).toBe('Nice try, darling.');
  });

  it('keeps the whole line readable for assistive technology at once', () => {
    render(<Bubble line={line(1, 'Nice try, darling.')} />);
    expect(
      screen.getByTestId('bubble-mallorca').querySelector('.visually-hidden')?.textContent,
    ).toBe('Nice try, darling.');
  });

  it('hides after 7 seconds', () => {
    render(<Bubble line={line(1, 'Hello')} />);
    act(() => {
      vi.advanceTimersByTime(6900);
    });
    expect(screen.queryByTestId('bubble-mallorca')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByTestId('bubble-mallorca')).toBeNull();
  });

  it('restarts when a new line replaces the old one', () => {
    const view = render(<Bubble line={line(1, 'First')} />);
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    view.rerender(<Bubble line={line(2, 'Second line')} />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(typed()).toBe('Second line');
  });

  it('shows the full text at once under reduced motion', () => {
    reducedMotion(true);
    render(<Bubble line={line(1, 'No hurry tonight.')} />);
    expect(typed()).toBe('No hurry tonight.');
  });

  it('does not bring back a dismissed line after a remount', () => {
    const said = line(1, 'Once is enough');
    const first = render(<Bubble line={said} />);
    act(() => {
      vi.advanceTimersByTime(7100);
    });
    first.unmount();
    render(<Bubble line={said} />);
    expect(screen.queryByTestId('bubble-mallorca')).toBeNull();
  });

  it('keeps the remaining time and the typed text across a remount', () => {
    const said = line(1, 'Still here');
    const first = render(<Bubble line={said} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    first.unmount();
    render(<Bubble line={said} />);
    expect(typed()).toBe('Still here');
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.queryByTestId('bubble-mallorca')).toBeNull();
  });

  it('renders nothing without a line', () => {
    const { container } = render(<Bubble line={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('marks the player bubble by speaker', () => {
    render(<Bubble line={{ id: 3, speaker: 'player', text: 'Hi', handNumber: 1 }} />);
    expect(
      screen.getByTestId('bubble-player').classList.contains('conversation-bubble-player'),
    ).toBe(true);
  });
});
