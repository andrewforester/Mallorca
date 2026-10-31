import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Coach } from './Coach.tsx';
import { coachFacts, readyCoach } from './coachFixtures.ts';

afterEach(cleanup);

describe('Coach', () => {
  it('shows the hint for the player hand with its shares', () => {
    render(<Coach state={readyCoach()} />);
    const hint = screen.getByTestId('coach-hint').textContent ?? '';
    expect(hint).toContain('Call 10');
    expect(hint).toContain('30%');
    expect(hint).toContain('Raise to 50');
    expect(hint).toContain('70%');
    expect(hint).not.toContain('Fold');
    expect(hint).toContain('mixed strategy');
  });

  it('says when the spot is approximate and when there is no advice', () => {
    const facts = coachFacts();
    render(
      <Coach state={readyCoach({ hint: facts.hint && { ...facts.hint, approximate: true } })} />,
    );
    expect(screen.getByTestId('coach-hint').textContent).toContain('Approximate');
    cleanup();
    render(<Coach state={readyCoach({ hint: null, strategy: null })} />);
    expect(screen.getByTestId('coach-hint').textContent).toContain('no advice');
  });

  it('shows the strategy grid with the player cell marked', () => {
    render(<Coach state={readyCoach()} />);
    const grid = screen.getByTestId('coach-strategy');
    expect(grid.querySelectorAll('.coach-cell')).toHaveLength(169);
    expect(grid.querySelectorAll('.coach-cell-hero')).toHaveLength(1);
  });

  it('switches to the range tab and explains a missing range', () => {
    render(<Coach state={readyCoach()} />);
    fireEvent.click(screen.getByTestId('coach-tab-range'));
    expect(screen.getByTestId('coach-tab-range').getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByTestId('coach-range')).toBeNull();
    expect(screen.getByRole('tabpanel').textContent).toContain('math bot');
  });

  it('draws the range grid by weight', () => {
    const range = Array.from({ length: 169 }, (_, cell) => (cell === 0 ? 1 : 0.25));
    render(<Coach state={readyCoach({ range, combos: 120.4, versus: 'range' })} />);
    fireEvent.click(screen.getByTestId('coach-tab-range'));
    const grid = screen.getByTestId('coach-range');
    expect(grid.querySelectorAll('.coach-cell')).toHaveLength(169);
    expect(screen.getByRole('tabpanel').textContent).toContain('120 combos');
  });

  it('shows the numbers of the spot', () => {
    render(<Coach state={readyCoach()} />);
    fireEvent.click(screen.getByTestId('coach-tab-numbers'));
    const numbers = screen.getByTestId('coach-numbers').textContent ?? '';
    expect(numbers).toContain('85%');
    expect(numbers).toContain('a random hand');
    expect(numbers).toContain('25%');
    expect(numbers).toContain('67%');
  });

  it('explains pot odds when nothing is to call', () => {
    render(<Coach state={readyCoach({ odds: null })} />);
    fireEvent.click(screen.getByTestId('coach-tab-numbers'));
    expect(screen.getByTestId('coach-numbers').textContent).toContain('Nothing to call');
  });

  it('has a line for every state without facts', () => {
    for (const [status, text] of [
      ['idle', 'your turn'],
      ['waiting', 'thinking'],
      ['unavailable', 'not available'],
    ] as const) {
      render(<Coach state={{ status, facts: null }} />);
      expect(screen.getByTestId('coach-status').textContent).toContain(text);
      cleanup();
    }
  });
});
