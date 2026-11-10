import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CASH, TOURNAMENT } from '../game/index.ts';
import en from '../locales/en.json';
import { StartScreen } from './StartScreen.tsx';

afterEach(cleanup);

describe('StartScreen', () => {
  it('starts a cash game or a tournament', () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);
    fireEvent.click(screen.getByTestId('start-cash'));
    expect(onStart).toHaveBeenLastCalledWith(CASH, 'math');
    fireEvent.click(screen.getByTestId('start-tournament'));
    expect(onStart).toHaveBeenLastCalledWith(TOURNAMENT, 'math');
  });

  it('starts against the chosen opponent', () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);
    expect(screen.getByTestId('opponent-math').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('opponent-cfr'));
    expect(screen.getByTestId('opponent-cfr').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('opponent-math').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByTestId('start-cash'));
    expect(onStart).toHaveBeenLastCalledWith(CASH, 'cfr');
  });

  it('shows the download of the chosen solver as a line and a bar', () => {
    render(
      <StartScreen onStart={vi.fn()} progress={{ opponent: 'cfr', received: 42, total: 100 }} />,
    );
    expect(screen.queryByTestId('start-loading')).toBeNull();
    fireEvent.click(screen.getByTestId('opponent-cfr'));
    expect(screen.getByTestId('start-loading').textContent).toBe(
      'Bringing the solver to the table · 42%',
    );
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
  });

  it('shows the line without a number when the size is unknown', () => {
    render(
      <StartScreen onStart={vi.fn()} progress={{ opponent: 'cfr', received: 42, total: 0 }} />,
    );
    fireEvent.click(screen.getByTestId('opponent-cfr'));
    expect(screen.getByTestId('start-loading').textContent).toBe(
      'Bringing the solver to the table',
    );
    expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
  });

  it('plays a fixed opponent without a choice and starts loading it at once', () => {
    const onStart = vi.fn();
    const onChoose = vi.fn();
    render(<StartScreen onStart={onStart} onChoose={onChoose} opponent="cfr-v2" />);
    expect(screen.queryByTestId('opponent-math')).toBeNull();
    expect(screen.queryByTestId('opponent-cfr-v2')).toBeNull();
    expect(onChoose).toHaveBeenCalledWith('cfr-v2');
    fireEvent.click(screen.getByTestId('start-cash'));
    expect(onStart).toHaveBeenLastCalledWith(CASH, 'cfr-v2');
  });

  it('shows the download of a fixed opponent without a choice', () => {
    render(
      <StartScreen
        onStart={vi.fn()}
        opponent="cfr"
        progress={{ opponent: 'cfr', received: 10, total: 100 }}
      />,
    );
    expect(screen.getByTestId('start-loading').textContent).toContain('10%');
  });

  it('lets the player choose her character among five, with her line and how hard she is', () => {
    const onCharacter = vi.fn();
    render(<StartScreen onStart={vi.fn()} character="mallorca" onCharacter={onCharacter} />);
    const choices = screen.getAllByTestId(/^character-/);
    expect(choices.map((node) => node.getAttribute('data-testid'))).toEqual([
      'character-mallorca',
      'character-mira',
      'character-ingrid',
      'character-lola',
      'character-nina',
    ]);
    expect(screen.getByTestId('character-mallorca').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('character-ingrid').textContent).toContain(
      'A professional. Plays to win.',
    );
    expect(screen.getByTestId('character-ingrid').textContent).toContain('The toughest');
    fireEvent.click(screen.getByTestId('character-nina'));
    expect(onCharacter).toHaveBeenCalledWith('nina');
  });

  it('greets the player in the words of the chosen character', () => {
    render(<StartScreen onStart={vi.fn()} character="lola" onCharacter={vi.fn()} />);
    expect(screen.getByTestId('tonight-face').textContent).toContain(
      'Finally! Deal me in, I feel lucky.',
    );
  });

  it('hides the coach switch when the coach is not offered', () => {
    render(<StartScreen onStart={vi.fn()} />);
    expect(screen.queryByTestId('start-coach')).toBeNull();
  });

  it('tells which opponent was chosen as soon as it is chosen', () => {
    const onChoose = vi.fn();
    render(<StartScreen onStart={vi.fn()} onChoose={onChoose} finePointer />);
    fireEvent.click(screen.getByTestId('opponent-cfr-v2'));
    expect(onChoose).toHaveBeenCalledWith('cfr-v2');
  });

  it('offers the v2 solver where a fine pointer is present', () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} finePointer />);
    fireEvent.click(screen.getByTestId('opponent-cfr-v2'));
    expect(screen.getByTestId('opponent-cfr-v2').textContent).toBe(en.start.opponents['cfr-v2']);
    fireEvent.click(screen.getByTestId('start-cash'));
    expect(onStart).toHaveBeenLastCalledWith(CASH, 'cfr-v2');
    expect(screen.getByTestId('start-loading')).toBeTruthy();
  });

  it('hides the v2 solver on a touch screen', () => {
    render(<StartScreen onStart={vi.fn()} finePointer={false} />);
    expect(screen.queryByTestId('opponent-cfr-v2')).toBeNull();
    expect(screen.getByTestId('opponent-cfr')).toBeTruthy();
  });

  it('says good night with a title and a line in place of the tagline', () => {
    const { container } = render(<StartScreen onStart={vi.fn()} farewell />);
    const farewell = screen.getByTestId('farewell');
    expect(farewell.querySelector('.tonight-farewell-title')?.textContent).toBe('Sleep well.');
    expect(farewell.textContent).toContain('The table will be here.');
    expect(container.textContent).not.toContain(en.start.tagline);
  });

  it('has no heading, only her in the attic with her greeting and the coach', () => {
    render(
      <StartScreen
        onStart={vi.fn()}
        onToggleCoach={vi.fn()}
        face={<div data-testid="face-seat" />}
      />,
    );
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    const frame = screen.getByTestId('tonight-face');
    expect(frame.querySelector('.face-room')).not.toBeNull();
    expect(frame.querySelector('.face-rail')).not.toBeNull();
    expect(frame.querySelector('.face-blur')).not.toBeNull();
    expect(frame.querySelector('[data-testid="face-seat"]')).not.toBeNull();
    expect(frame.textContent).toContain("Hi. I'm Mallorca.");
    expect((screen.getByTestId('start-coach') as HTMLInputElement).getAttribute('role')).toBe(
      'switch',
    );
  });

  it('shows the empty room with her name when the face is off', () => {
    render(<StartScreen onStart={vi.fn()} character="ingrid" onCharacter={vi.fn()} />);
    const frame = screen.getByTestId('tonight-face');
    expect(frame.querySelector('.face-room')).not.toBeNull();
    expect(frame.querySelector('[data-testid="face-seat"]')).toBeNull();
    expect(frame.querySelector('.face-frame-name')?.textContent).toBe('Ingrid');
  });

  it('asks to sit down to a cash game, with the tournament as the quieter choice', () => {
    render(<StartScreen onStart={vi.fn()} />);
    const sit = screen.getByTestId('start-cash');
    expect(sit.querySelector('.start-main-label')?.textContent).toBe(en.start.sit);
    expect(sit.querySelector('.start-main-detail')?.textContent).toBe(en.start.cash);
    expect(sit.classList.contains('start-main')).toBe(true);
    const tournament = screen.getByTestId('start-tournament');
    expect(tournament.textContent).toBe(en.start.tournament);
    expect(tournament.classList.contains('start-second')).toBe(true);
  });

  it('shows no seed', () => {
    const { container } = render(<StartScreen onStart={vi.fn()} />);
    expect(container.querySelector('.start-seed')).toBeNull();
    expect(container.textContent).not.toContain('Seed');
  });

  it('puts the name and how hard she is on one line of each character card', () => {
    render(<StartScreen onStart={vi.fn()} character="mallorca" onCharacter={vi.fn()} />);
    const top = screen.getByTestId('character-ingrid').querySelector('.character-top');
    expect(top?.querySelector('.character-name')?.textContent).toBe('Ingrid');
    expect(top?.querySelector('.character-hard')?.textContent).toBe('The toughest');
  });

  it('shows the tagline by default', () => {
    const { container } = render(<StartScreen onStart={vi.fn()} />);
    expect(screen.queryByTestId('farewell')).toBeNull();
    expect(container.textContent).toContain(en.start.tagline);
  });

  it('sits over the dimmed room', () => {
    render(<StartScreen onStart={vi.fn()} />);
    expect(screen.getByTestId('scene').classList.contains('scene-dimmed')).toBe(true);
  });
});
