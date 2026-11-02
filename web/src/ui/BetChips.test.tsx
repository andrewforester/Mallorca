import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { BetChips } from './BetChips.tsx';

afterEach(cleanup);

describe('BetChips', () => {
  it('renders nothing without a bet', () => {
    const { container } = render(<BetChips seat={1} amount={0} />);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByTestId('bet-1')).toBeNull();
  });

  it('shows a decorative chip stack and the amount', () => {
    render(<BetChips seat={1} amount={60} />);
    const bet = screen.getByTestId('bet-1');
    expect(within(bet).getByText('60')).not.toBeNull();
    const stack = bet.querySelector('.chip-stack');
    expect(stack?.getAttribute('aria-hidden')).toBe('true');
    expect(stack?.querySelectorAll('.chip').length).toBe(2);
    expect(screen.getByText('Bet 60')).not.toBeNull();
  });

  it('marks the stack as sweeping only while it moves into the pot', () => {
    const { rerender } = render(<BetChips seat={1} amount={60} />);
    expect(screen.getByTestId('bet-1').classList.contains('bet-sweep')).toBe(false);
    rerender(<BetChips seat={1} amount={60} sweeping />);
    expect(screen.getByTestId('bet-1').classList.contains('bet-sweep')).toBe(true);
  });
});
