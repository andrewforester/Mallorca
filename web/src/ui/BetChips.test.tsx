import { cleanup, render, screen } from '@testing-library/preact';
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
    expect(bet.querySelector('.bet-amount')?.textContent).toBe('60');
    const stack = bet.querySelector('.chip-stack');
    expect(stack?.getAttribute('aria-hidden')).toBe('true');
    expect(stack?.querySelectorAll('.chip').length).toBe(2);
    expect(screen.getByText('Bet 60')).not.toBeNull();
  });
});
