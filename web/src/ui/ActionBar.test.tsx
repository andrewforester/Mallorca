import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from './ActionBar.tsx';
import { viewModel } from './fixtures.ts';

afterEach(cleanup);

describe('ActionBar', () => {
  it('shows Call with the amount facing a bet', () => {
    render(<ActionBar controls={viewModel().controls} onAct={vi.fn()} />);
    expect(screen.getByTestId('passive').textContent).toBe('Call 60');
    expect(screen.getByTestId('fold').textContent).toBe('Fold');
    expect(screen.getByTestId('raise').textContent).toBe('Raise to 160');
  });

  it('names the raise button Bet when opening the betting', () => {
    const base = viewModel().controls;
    const controls = { ...base, raise: { ...base.raise!, kind: 'bet' as const, min: 60 } };
    render(<ActionBar controls={controls} onAct={vi.fn()} />);
    expect(screen.getByTestId('raise').textContent).toBe('Bet 60');
  });

  it('shows Check when nothing is owed', () => {
    const controls = viewModel({ passive: { kind: 'check', amount: 0 } }).controls;
    render(<ActionBar controls={controls} onAct={vi.fn()} />);
    expect(screen.getByTestId('passive').textContent).toBe('Check');
  });

  it('disables everything when not enabled', () => {
    const controls = viewModel({ enabled: false }).controls;
    render(<ActionBar controls={controls} onAct={vi.fn()} />);
    for (const id of ['fold', 'passive', 'raise', 'preset-half', 'preset-pot', 'preset-allin']) {
      expect((screen.getByTestId(id) as HTMLButtonElement).disabled).toBe(true);
    }
    expect((screen.getByTestId('raise-amount') as HTMLInputElement).disabled).toBe(true);
  });

  it('reports intents', () => {
    const onAct = vi.fn();
    render(<ActionBar controls={viewModel().controls} onAct={onAct} />);
    fireEvent.click(screen.getByTestId('fold'));
    fireEvent.click(screen.getByTestId('passive'));
    fireEvent.click(screen.getByTestId('preset-pot'));
    fireEvent.click(screen.getByTestId('raise'));
    expect(onAct.mock.calls).toEqual([
      [{ kind: 'fold' }],
      [{ kind: 'passive' }],
      [{ kind: 'raise', to: 400 }],
    ]);
  });

  it('disables raise when no raise is legal', () => {
    const controls = viewModel({ raise: null }).controls;
    render(<ActionBar controls={controls} onAct={vi.fn()} />);
    expect((screen.getByTestId('raise') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('raise-amount')).toBeNull();
  });

  it('responds to f, c and r only when enabled', () => {
    const onAct = vi.fn();
    const view = render(<ActionBar controls={viewModel().controls} onAct={onAct} />);
    fireEvent.keyDown(document, { key: 'f' });
    fireEvent.keyDown(document, { key: 'c' });
    fireEvent.keyDown(document, { key: 'r' });
    expect(onAct.mock.calls).toEqual([
      [{ kind: 'fold' }],
      [{ kind: 'passive' }],
      [{ kind: 'raise', to: 160 }],
    ]);
    onAct.mockClear();
    view.rerender(<ActionBar controls={viewModel({ enabled: false }).controls} onAct={onAct} />);
    fireEvent.keyDown(document, { key: 'f' });
    fireEvent.keyDown(document, { key: 'c' });
    fireEvent.keyDown(document, { key: 'r' });
    expect(onAct).not.toHaveBeenCalled();
  });

  it('moves the slider with the arrow keys', () => {
    render(<ActionBar controls={viewModel().controls} onAct={vi.fn()} />);
    const slider = screen.getByTestId('raise-amount') as HTMLInputElement;
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(Number(slider.value)).toBeGreaterThan(160);
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(Number(slider.value)).toBe(160);
  });
});
