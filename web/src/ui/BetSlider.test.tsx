import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BetSlider } from './BetSlider.tsx';

afterEach(cleanup);

const raise = {
  kind: 'raise' as const,
  min: 160,
  max: 2000,
  presets: { halfPot: 250, pot: 400, allIn: 2000 },
};

describe('BetSlider', () => {
  it('spans minimum raise to all-in', () => {
    render(<BetSlider raise={raise} value={160} disabled={false} onChange={vi.fn()} />);
    const slider = screen.getByTestId('raise-amount') as HTMLInputElement;
    expect(slider.min).toBe('160');
    expect(slider.max).toBe('2000');
  });

  it('presets set the amount', () => {
    const onChange = vi.fn();
    render(<BetSlider raise={raise} value={160} disabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('preset-half'));
    fireEvent.click(screen.getByTestId('preset-pot'));
    fireEvent.click(screen.getByTestId('preset-allin'));
    expect(onChange.mock.calls).toEqual([[250], [400], [2000]]);
  });

  it('reports slider input', () => {
    const onChange = vi.fn();
    render(<BetSlider raise={raise} value={160} disabled={false} onChange={onChange} />);
    fireEvent.input(screen.getByTestId('raise-amount'), { target: { value: '700' } });
    expect(onChange).toHaveBeenCalledWith(700);
  });
});
