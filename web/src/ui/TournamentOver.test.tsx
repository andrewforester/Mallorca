import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TournamentOver } from './TournamentOver.tsx';

afterEach(cleanup);

describe('TournamentOver', () => {
  it('offers to play again or to stop for tonight', () => {
    const onPlayAgain = vi.fn();
    const onLeave = vi.fn();
    render(
      <TournamentOver won winner="You" hands={9} onPlayAgain={onPlayAgain} onLeave={onLeave} />,
    );
    fireEvent.click(screen.getByTestId('play-again'));
    fireEvent.click(screen.getByTestId('leave-tonight'));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('leave-tonight').textContent).toBe("That's enough for tonight");
    expect(screen.getByTestId('play-again').className).toBe(
      screen.getByTestId('leave-tonight').className,
    );
  });

  it('names the winner and the number of hands', () => {
    const { container } = render(
      <TournamentOver
        won={false}
        winner="Mallorca"
        hands={23}
        onPlayAgain={vi.fn()}
        onLeave={vi.fn()}
      />,
    );
    expect(container.textContent).toContain('Mallorca wins the tournament in 23 hands');
    cleanup();
    const mine = render(
      <TournamentOver won winner="You" hands={1} onPlayAgain={vi.fn()} onLeave={vi.fn()} />,
    );
    expect(mine.container.textContent).toContain('You win the tournament in 1 hand');
  });

  it('names the outcome under the title', () => {
    const { container } = render(
      <TournamentOver
        won={false}
        winner="Mallorca"
        hands={9}
        onPlayAgain={vi.fn()}
        onLeave={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Good game');
    expect(container.textContent).toContain('Mallorca wins the tournament');
  });
});
