import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Pot } from './Pot.tsx';

afterEach(cleanup);

describe('Pot', () => {
  it('shows the collected pot and the total as words, without chips', () => {
    render(<Pot collected={120} total={200} />);
    const pot = screen.getByTestId('pot');
    expect(pot.textContent).toBe('Pot 120Total 200');
    expect(pot.getAttribute('data-amount')).toBe('200');
    expect(pot.getAttribute('data-collected')).toBe('120');
    expect(pot.querySelector('.chip-stack')).toBeNull();
  });

  it('shows only the total before anything is collected', () => {
    render(<Pot collected={0} total={30} />);
    const pot = screen.getByTestId('pot');
    expect(pot.textContent).toBe('Total 30');
    expect(pot.querySelector('.chip-stack')).toBeNull();
  });

  it('shows only the pot when no bets are on the felt', () => {
    render(<Pot collected={120} total={120} />);
    expect(screen.getByTestId('pot').textContent).toBe('Pot 120');
  });
});
