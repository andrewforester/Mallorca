import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Coach } from './Coach.tsx';
import { moveColor } from './CoachGrid.tsx';
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
      render(<Coach state={{ status, facts: null, review: [], log: [] }} />);
      expect(screen.getByTestId('coach-status').textContent).toContain(text);
      cleanup();
    }
  });
});

describe('Coach colours', () => {
  it('gives every bet size its own shade', () => {
    const moves = [
      { label: 'check' as const, amount: 0, tone: 'passive' as const },
      { label: 'bet' as const, amount: 20, tone: 'small' as const },
      { label: 'bet' as const, amount: 30, tone: 'small' as const },
      { label: 'bet' as const, amount: 80, tone: 'large' as const },
      { label: 'allIn' as const, amount: 1980, tone: 'allIn' as const },
    ];
    const colours = moves.map((move) => moveColor(move, moves));
    expect(new Set(colours).size).toBe(5);
    expect(colours[1]).toContain('0%');
    expect(colours[3]).toContain('100%');
  });
});

describe('Coach tab', () => {
  it('keeps the chosen tab across the player turns', () => {
    const { rerender } = render(<Coach state={readyCoach()} />);
    fireEvent.click(screen.getByTestId('coach-tab-numbers'));
    rerender(<Coach state={{ status: 'idle', facts: null, review: [], log: [] }} />);
    rerender(<Coach state={readyCoach()} />);
    expect(screen.getByTestId('coach-tab-numbers').getAttribute('aria-selected')).toBe('true');
  });
});

describe('Coach insights', () => {
  const range = Array.from({ length: 169 }, () => 0.5);
  const composition = {
    shares: { strong: 0.1, twoPair: 0.05, topPair: 0.2, pair: 0.25, draw: 0.15, air: 0.25 },
    ahead: 0.62,
  };

  it('shows what the range is made of and how much of it the player beats', () => {
    render(<Coach state={readyCoach({ range, combos: 300, versus: 'range', composition })} />);
    fireEvent.click(screen.getByTestId('coach-tab-range'));
    const text = screen.getByTestId('coach-composition').textContent ?? '';
    expect(text).toContain('Two pair');
    expect(text).toContain('25%');
    expect(text).toContain('62%');
  });

  it('shows the outs and the blockers with the numbers', () => {
    const outs = { cards: [12, 13], nextCard: 2 / 47, byRiver: 0.084 };
    render(<Coach state={readyCoach({ outs, blockers: 0.12 })} />);
    fireEvent.click(screen.getByTestId('coach-tab-numbers'));
    const text = screen.getByTestId('coach-outs').textContent ?? '';
    expect(text).toContain('2 outs');
    expect(text).toContain('5c');
    expect(text).toContain('4%');
    expect(text).toContain('8%');
    expect(screen.getByTestId('coach-blockers').textContent).toContain('12%');
  });
});

describe('Coach review and leaks', () => {
  const moves = [
    { label: 'fold' as const, amount: 0, tone: 'fold' as const },
    { label: 'call' as const, amount: 10, tone: 'passive' as const },
    { label: 'raise' as const, amount: 60, tone: 'small' as const },
  ];
  const decision = {
    street: 'preflop' as const,
    action: { kind: 'call' as const },
    moves,
    mine: [0.02, 0.18, 0.8],
    approximate: false,
    chosen: 1,
    frequency: 0.18,
    grade: 'rare' as const,
    spot: 'open' as const,
  };

  it('reviews the hand between turns', () => {
    render(<Coach state={{ status: 'idle', facts: null, review: [decision], log: [decision] }} />);
    const text = screen.getByTestId('coach-review').textContent ?? '';
    expect(text).toContain('Preflop');
    expect(text).toContain('Call 10');
    expect(text).toContain('Rare in the strategy');
    expect(text).toContain('Raise to 60 80%');
  });

  it('leaves out shares that round to nothing', () => {
    const tiny = { ...decision, mine: [0.004, 0.196, 0.8] };
    render(<Coach state={{ status: 'idle', facts: null, review: [tiny], log: [] }} />);
    expect(screen.getByTestId('coach-review').textContent).not.toContain('Fold 0%');
  });

  it('shows leaks once a spot has ten decisions', () => {
    const log = Array.from({ length: 10 }, () => decision);
    render(<Coach state={{ ...readyCoach(), log }} />);
    fireEvent.click(screen.getByTestId('coach-tab-session'));
    const text = screen.getByTestId('coach-leaks').textContent ?? '';
    expect(text).toContain('Raise first in from the button');
    expect(text).toContain('You 0%');
    expect(text).toContain('strategy 80%');
    expect(text).toContain('10 spots');
  });

  it('says how leaks appear before there are enough spots', () => {
    render(<Coach state={{ ...readyCoach(), log: [decision] }} />);
    fireEvent.click(screen.getByTestId('coach-tab-session'));
    expect(screen.getByTestId('coach-leaks').textContent).toContain('10 spots of one kind');
  });
});
