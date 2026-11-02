import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TournamentOver } from './TournamentOver.tsx';

afterEach(cleanup);

describe('TournamentOver', () => {
  it('offers to play again or to stop for tonight', () => {
    const onPlayAgain = vi.fn();
    const onLeave = vi.fn();
    render(<TournamentOver won onPlayAgain={onPlayAgain} onLeave={onLeave} />);
    fireEvent.click(screen.getByTestId('play-again'));
    fireEvent.click(screen.getByTestId('leave-tonight'));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('leave-tonight').textContent).toBe("That's enough for tonight");
  });

  it('names the outcome under the title', () => {
    const { container } = render(
      <TournamentOver won={false} onPlayAgain={vi.fn()} onLeave={vi.fn()} />,
    );
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Good game');
    expect(container.textContent).toContain('You lost the tournament');
  });
});
