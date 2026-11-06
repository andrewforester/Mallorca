import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionBar, HOLD_MS } from './ActionBar.tsx';
import { viewModel } from './fixtures.ts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function bar(overrides = {}, onAct = vi.fn()) {
  const view = render(<ActionBar controls={viewModel(overrides).controls} onAct={onAct} />);
  return { onAct, view };
}

function value(): number {
  return Number((screen.getByTestId('raise-amount') as HTMLInputElement).value);
}

describe('ActionBar buttons', () => {
  it('shows Fold, Call with the amount and Raise to the smallest raise', () => {
    bar();
    expect(screen.getByTestId('fold').textContent).toContain('Fold');
    expect(screen.getByTestId('passive').textContent).toContain('Call 60');
    expect(screen.getByTestId('raise').textContent).toContain('Raise to 160');
    expect(screen.queryByTestId('raise-amount')).toBeNull();
  });

  it('names the raise button Bet when opening the betting', () => {
    const base = viewModel().controls;
    const controls = { ...base, raise: { ...base.raise!, kind: 'bet' as const, min: 60 } };
    render(<ActionBar controls={controls} onAct={vi.fn()} />);
    expect(screen.getByTestId('raise').textContent).toContain('Bet 60');
  });

  it('shows Check when nothing is owed', () => {
    bar({ passive: { kind: 'check', amount: 0 } });
    expect(screen.getByTestId('passive').textContent).toContain('Check');
  });

  it('disables every button when not enabled', () => {
    bar({ enabled: false });
    for (const id of ['fold', 'passive', 'raise']) {
      expect((screen.getByTestId(id) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('disables raise when no raise is legal', () => {
    bar({ raise: null });
    expect((screen.getByTestId('raise') as HTMLButtonElement).disabled).toBe(true);
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

  it('folds and calls at once when a call is owed', () => {
    const { onAct } = bar();
    fireEvent.click(screen.getByTestId('fold'));
    fireEvent.click(screen.getByTestId('passive'));
    expect(onAct.mock.calls).toEqual([[{ kind: 'fold' }], [{ kind: 'passive' }]]);
  });
});

describe('ActionBar bet sheet', () => {
  it('opens the sheet from Raise with the presets, the slider and the size', () => {
    const { onAct } = bar();
    fireEvent.click(screen.getByTestId('raise'));
    expect(onAct).not.toHaveBeenCalled();
    expect(screen.queryByTestId('fold')).toBeNull();
    for (const id of ['preset-half', 'preset-pot', 'preset-allin', 'raise-amount', 'raise-less']) {
      expect(screen.getByTestId(id)).not.toBeNull();
    }
    expect(screen.getByTestId('raise-size').textContent).toBe('160');
    expect(screen.getByTestId('raise-confirm').textContent).toContain('Raise to 160');
  });

  it('steps the size by the big blind and confirms it', () => {
    const { onAct } = bar();
    fireEvent.click(screen.getByTestId('raise'));
    fireEvent.click(screen.getByTestId('raise-more'));
    fireEvent.click(screen.getByTestId('raise-more'));
    expect(value()).toBe(200);
    fireEvent.click(screen.getByTestId('raise-less'));
    expect(value()).toBe(180);
    fireEvent.click(screen.getByTestId('preset-pot'));
    fireEvent.click(screen.getByTestId('raise-confirm'));
    expect(onAct.mock.calls).toEqual([[{ kind: 'raise', to: 400 }]]);
  });

  it('marks the chosen preset', () => {
    bar();
    fireEvent.click(screen.getByTestId('raise'));
    fireEvent.click(screen.getByTestId('preset-half'));
    expect(screen.getByTestId('preset-half').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('preset-pot').getAttribute('aria-pressed')).toBe('false');
  });

  it('offers Min instead of Pot when the pot is bigger than the stack', () => {
    const base = viewModel().controls;
    const raise = { ...base.raise!, max: 380, presets: { halfPot: 250, pot: 380, allIn: 380 } };
    render(<ActionBar controls={{ ...base, raise }} onAct={vi.fn()} />);
    fireEvent.click(screen.getByTestId('raise'));
    expect(screen.queryByTestId('preset-pot')).toBeNull();
    fireEvent.click(screen.getByTestId('preset-min'));
    expect(value()).toBe(160);
  });

  it('goes back to the three buttons without acting', () => {
    const { onAct } = bar();
    fireEvent.click(screen.getByTestId('raise'));
    fireEvent.click(screen.getByTestId('raise-back'));
    expect(screen.getByTestId('fold')).not.toBeNull();
    expect(onAct).not.toHaveBeenCalled();
  });

  it('asks to hold the confirm for an all-in and acts only after the hold', () => {
    vi.useFakeTimers();
    const { onAct } = bar();
    fireEvent.click(screen.getByTestId('raise'));
    fireEvent.click(screen.getByTestId('preset-allin'));
    const confirm = screen.getByTestId('raise-confirm');
    expect(confirm.textContent).toContain('Hold for all-in 2000');
    fireEvent.click(confirm);
    expect(onAct).not.toHaveBeenCalled();
    fireEvent.pointerDown(confirm);
    act(() => {
      vi.advanceTimersByTime(HOLD_MS / 2);
    });
    fireEvent.pointerUp(confirm);
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onAct).not.toHaveBeenCalled();
    fireEvent.pointerDown(confirm);
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onAct.mock.calls).toEqual([[{ kind: 'raise', to: 2000 }]]);
  });
});

describe('ActionBar keyboard', () => {
  it('folds with f, calls with c and opens the sheet with r', () => {
    const { onAct } = bar();
    fireEvent.keyDown(document, { key: 'f' });
    fireEvent.keyDown(document, { key: 'c' });
    expect(onAct.mock.calls).toEqual([[{ kind: 'fold' }], [{ kind: 'passive' }]]);
    fireEvent.keyDown(document, { key: 'r' });
    expect(screen.getByTestId('raise-amount')).not.toBeNull();
  });

  it('moves the size with the arrows, goes back with Escape and confirms with Enter', () => {
    const { onAct } = bar();
    fireEvent.keyDown(document, { key: 'r' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(value()).toBe(180);
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(value()).toBe(160);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('raise-amount')).toBeNull();
    fireEvent.keyDown(document, { key: 'r' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onAct.mock.calls).toEqual([[{ kind: 'raise', to: 160 }]]);
  });

  it('ignores the keys when not enabled', () => {
    const { onAct } = bar({ enabled: false });
    for (const key of ['f', 'c', 'r', 'Enter']) {
      fireEvent.keyDown(document, { key });
    }
    expect(onAct).not.toHaveBeenCalled();
    expect(screen.queryByTestId('raise-amount')).toBeNull();
  });
});
