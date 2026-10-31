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

  it('colours hearts and diamonds red and clubs and spades black', () => {
    for (const card of [0, 1, 2, 3]) {
      render(<Card card={card} />);
    }
    expect(screen.getByRole('img', { name: '2d' }).classList.contains('card-red')).toBe(true);
    expect(screen.getByRole('img', { name: '2h' }).classList.contains('card-red')).toBe(true);
    expect(screen.getByRole('img', { name: '2c' }).classList.contains('card-black')).toBe(true);
    expect(screen.getByRole('img', { name: '2s' }).classList.contains('card-black')).toBe(true);
  });

  it('draws the corner index twice on a face card', () => {
    render(<Card card={51} />);
    expect(screen.getAllByText('A').length).toBe(2);
  });

  it('renders the back without rank text', () => {
    const { container } = render(<Card card="back" />);
    expect(screen.getByRole('img', { name: 'Face down card' })).not.toBeNull();
    expect(container.querySelector('text')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
