import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Pot } from './Pot.tsx';

afterEach(cleanup);

describe('Pot', () => {
  it('shows the amount with decorative chips hidden from assistive tech', () => {
    render(<Pot collected={120} total={200} />);
    const pot = screen.getByTestId('pot');
    expect(pot.textContent).toBe('Pot 200');
    expect(pot.getAttribute('data-amount')).toBe('200');
    expect(pot.getAttribute('data-collected')).toBe('120');
    const stack = pot.querySelector('.chip-stack');
    expect(stack?.getAttribute('aria-hidden')).toBe('true');
    expect(stack?.querySelectorAll('.chip').length).toBe(3);
  });
});
