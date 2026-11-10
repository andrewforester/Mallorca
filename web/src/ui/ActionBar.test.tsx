import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionBar, HOLD_MS } from './ActionBar.tsx';
import { NUDGE_MS } from './useHold.ts';
import { viewModel } from './fixtures.ts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function bar(overrides = {}, onAct = vi.fn()) {
  const view = render(<ActionBar controls={viewModel(overrides).controls} onAct={onAct} />);
  return { onAct, view };
}

function onlyAllIn() {
  const base = viewModel().controls;
  const raise = {
    ...base.raise!,
    min: 1208,
    max: 1208,
    presets: { halfPot: 1208, pot: 1208, allIn: 1208 },
  };
  const onAct = vi.fn();
  render(<ActionBar controls={{ ...base, raise }} onAct={onAct} />);
  return onAct;
}

function value(): number {
  return Number((screen.getByTestId('raise-amount') as HTMLInputElement).value);
}

describe('ActionBar', () => {
  it('shows the size controls with the buttons whenever a raise is legal', () => {
    bar();
    for (const id of ['fold', 'passive', 'raise', 'preset-half', 'preset-pot', 'preset-allin']) {
      expect(screen.getByTestId(id)).not.toBeNull();
    }
    expect(screen.getByTestId('raise-amount')).not.toBeNull();
    expect(screen.queryByTestId('raise-back')).toBeNull();
    expect(screen.queryByTestId('raise-confirm')).toBeNull();
  });

  it('starts at the pot and names it on the raise button', () => {
    bar();
    expect(value()).toBe(400);
    expect(screen.getByTestId('raise-size').textContent).toBe('400');
    expect(screen.getByTestId('preset-pot').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('raise').textContent).toContain('Raise to 400');
    expect(screen.getByTestId('passive').textContent).toContain('Call 60');
    expect(screen.getByTestId('fold').textContent).toContain('Fold');
  });

  it('starts at Min when the pot preset reaches the stack', () => {
    const base = viewModel().controls;
    const raise = { ...base.raise!, max: 380, presets: { halfPot: 250, pot: 380, allIn: 380 } };
    render(<ActionBar controls={{ ...base, raise }} onAct={vi.fn()} />);
    expect(screen.queryByTestId('preset-pot')).toBeNull();
    expect(screen.getByTestId('preset-min').getAttribute('aria-pressed')).toBe('true');
    expect(value()).toBe(160);
  });

  it('names the raise button Bet when opening the betting', () => {
    const base = viewModel().controls;
    const controls = { ...base, raise: { ...base.raise!, kind: 'bet' as const } };
    render(<ActionBar controls={controls} onAct={vi.fn()} />);
    expect(screen.getByTestId('raise').textContent).toContain('Bet 400');
  });

  it('raises in one tap with the chosen size, and a preset alone does not act', () => {
    const { onAct } = bar();
    fireEvent.click(screen.getByTestId('preset-half'));
    expect(onAct).not.toHaveBeenCalled();
    expect(screen.getByTestId('raise').textContent).toContain('Raise to 250');
    fireEvent.click(screen.getByTestId('raise'));
    expect(onAct.mock.calls).toEqual([[{ kind: 'raise', to: 250 }]]);
  });

  it('steps the size by the big blind', () => {
    bar();
    fireEvent.click(screen.getByTestId('raise-more'));
    expect(value()).toBe(420);
    fireEvent.click(screen.getByTestId('raise-less'));
    fireEvent.click(screen.getByTestId('raise-less'));
    expect(value()).toBe(380);
  });

  it('asks to hold Raise for an all-in and acts only after the hold', () => {
    vi.useFakeTimers();
    const { onAct } = bar();
    fireEvent.click(screen.getByTestId('preset-allin'));
    const raise = screen.getByTestId('raise');
    expect(raise.textContent).toContain('Hold for all-in 2000');
    fireEvent.click(raise);
    expect(onAct).not.toHaveBeenCalled();
    fireEvent.pointerDown(raise);
    act(() => {
      vi.advanceTimersByTime(HOLD_MS / 2);
    });
    fireEvent.pointerUp(raise);
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onAct).not.toHaveBeenCalled();
    fireEvent.pointerDown(raise);
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onAct.mock.calls).toEqual([[{ kind: 'raise', to: 2000 }]]);
  });

  it('shudders after a short press on the all-in and does not act', () => {
    vi.useFakeTimers();
    const { onAct } = bar();
    fireEvent.click(screen.getByTestId('preset-allin'));
    const raise = screen.getByTestId('raise');
    expect(raise.classList.contains('button-nudge')).toBe(false);
    fireEvent.pointerDown(raise);
    expect(raise.classList.contains('button-holding')).toBe(true);
    act(() => {
      vi.advanceTimersByTime(HOLD_MS / 4);
    });
    fireEvent.pointerUp(raise);
    fireEvent.pointerLeave(raise);
    expect(raise.classList.contains('button-holding')).toBe(false);
    expect(raise.classList.contains('button-nudge')).toBe(true);
    act(() => {
      vi.advanceTimersByTime(NUDGE_MS);
    });
    expect(raise.classList.contains('button-nudge')).toBe(false);
    expect(onAct).not.toHaveBeenCalled();
  });

  it('does not shudder after a completed hold', () => {
    vi.useFakeTimers();
    bar();
    fireEvent.click(screen.getByTestId('preset-allin'));
    const raise = screen.getByTestId('raise');
    fireEvent.pointerDown(raise);
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    fireEvent.pointerUp(raise);
    expect(raise.classList.contains('button-nudge')).toBe(false);
  });

  it('goes all-in on one click when all-in is the only raise', () => {
    const onAct = onlyAllIn();
    const raise = screen.getByTestId('raise');
    expect(raise.textContent).toContain('All-in 1208');
    expect(raise.textContent).not.toContain('Hold');
    expect(raise.classList.contains('button-hold')).toBe(false);
    fireEvent.click(raise);
    expect(onAct.mock.calls).toEqual([[{ kind: 'raise', to: 1208 }]]);
  });

  it('shows Check when nothing is owed and folds and calls at once', () => {
    const { onAct } = bar({ passive: { kind: 'check', amount: 0 } });
    expect(screen.getByTestId('passive').textContent).toContain('Check');
    fireEvent.click(screen.getByTestId('passive'));
    expect(onAct.mock.calls).toEqual([[{ kind: 'passive' }]]);
  });

  it('has no size controls when no raise is legal', () => {
    bar({ raise: null });
    expect((screen.getByTestId('raise') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('raise-amount')).toBeNull();
  });

  it('disables every control when not enabled', () => {
    bar({ enabled: false });
    for (const id of ['fold', 'passive', 'raise', 'preset-half', 'preset-pot', 'raise-more']) {
      expect((screen.getByTestId(id) as HTMLButtonElement).disabled).toBe(true);
    }
    expect((screen.getByTestId('raise-amount') as HTMLInputElement).disabled).toBe(true);
  });

  it('shows the key of each move as a hint hidden from assistive tech', () => {
    bar();
    for (const [id, key] of [
      ['fold', 'F'],
      ['passive', 'C'],
      ['raise', 'R'],
    ]) {
      const hint = screen.getByTestId(id as string).querySelector('.key-hint');
      expect(hint?.textContent).toBe(key);
      expect(hint?.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

describe('ActionBar keyboard', () => {
  it('folds with f, calls with c and raises the chosen size with r', () => {
    const { onAct } = bar();
    fireEvent.keyDown(document, { key: 'f' });
    fireEvent.keyDown(document, { key: 'c' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(value()).toBe(420);
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    fireEvent.keyDown(document, { key: 'r' });
    expect(onAct.mock.calls).toEqual([
      [{ kind: 'fold' }],
      [{ kind: 'passive' }],
      [{ kind: 'raise', to: 400 }],
    ]);
  });

  it('needs r held for an all-in', () => {
    vi.useFakeTimers();
    const { onAct } = bar();
    fireEvent.click(screen.getByTestId('preset-allin'));
    fireEvent.keyDown(document, { key: 'r' });
    fireEvent.keyUp(document, { key: 'r' });
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onAct).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'r' });
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onAct.mock.calls).toEqual([[{ kind: 'raise', to: 2000 }]]);
  });

  it('goes all-in with one press of r when all-in is the only raise', () => {
    const onAct = onlyAllIn();
    fireEvent.keyDown(document, { key: 'r' });
    expect(onAct.mock.calls).toEqual([[{ kind: 'raise', to: 1208 }]]);
  });

  it('ignores the keys when not enabled', () => {
    const { onAct } = bar({ enabled: false });
    for (const key of ['f', 'c', 'r']) {
      fireEvent.keyDown(document, { key });
    }
    expect(onAct).not.toHaveBeenCalled();
  });
});
