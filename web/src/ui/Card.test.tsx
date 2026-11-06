import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Card } from './Card.tsx';

afterEach(cleanup);

describe('Card', () => {
  it('renders rank and suit for a face-up card', () => {
    const { container } = render(<Card card={51} />);
    expect(container.textContent).toContain('A');
    expect(container.textContent).toContain('♠');
  });

  it('writes ten as 10', () => {
    const { container } = render(<Card card={32} />);
    expect(container.textContent).toContain('10');
  });

  it('gives each of the four suits its own colour class', () => {
    for (const card of [0, 1, 2, 3]) {
      render(<Card card={card} />);
    }
    expect(screen.getByRole('img', { name: '2c' }).classList.contains('card-clubs')).toBe(true);
    expect(screen.getByRole('img', { name: '2d' }).classList.contains('card-diamonds')).toBe(true);
    expect(screen.getByRole('img', { name: '2h' }).classList.contains('card-hearts')).toBe(true);
    expect(screen.getByRole('img', { name: '2s' }).classList.contains('card-spades')).toBe(true);
  });

  it('writes the rank once above the suit on a face card', () => {
    render(<Card card={51} />);
    expect(screen.getAllByText('A').length).toBe(1);
    expect(screen.getAllByText('♠').length).toBe(1);
  });

  it('renders the back without rank text', () => {
    const { container } = render(<Card card="back" />);
    expect(screen.getByRole('img', { name: 'Face down card' })).not.toBeNull();
    expect(container.querySelector('text')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
