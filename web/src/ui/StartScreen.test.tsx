import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CASH, TOURNAMENT } from '../game/index.ts';
import en from '../locales/en.json';
import { StartScreen } from './StartScreen.tsx';

afterEach(cleanup);

describe('StartScreen', () => {
  it('starts a cash game or a tournament', () => {
    const onStart = vi.fn();
    render(<StartScreen seed={42} onStart={onStart} />);
    fireEvent.click(screen.getByTestId('start-cash'));
    expect(onStart).toHaveBeenLastCalledWith(CASH, 'math');
    fireEvent.click(screen.getByTestId('start-tournament'));
    expect(onStart).toHaveBeenLastCalledWith(TOURNAMENT, 'math');
  });

  it('starts against the chosen opponent', () => {
    const onStart = vi.fn();
    render(<StartScreen seed={42} onStart={onStart} />);
    expect(screen.getByTestId('opponent-math').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('opponent-cfr'));
    expect(screen.getByTestId('opponent-cfr').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('opponent-math').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByTestId('start-cash'));
    expect(onStart).toHaveBeenLastCalledWith(CASH, 'cfr');
  });

  it('shows the download of the chosen solver as a line and a bar', () => {
    render(
      <StartScreen
        seed={1}
        onStart={vi.fn()}
        progress={{ opponent: 'cfr', received: 42, total: 100 }}
      />,
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
      <StartScreen
        seed={1}
        onStart={vi.fn()}
        progress={{ opponent: 'cfr', received: 42, total: 0 }}
      />,
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
    render(<StartScreen seed={1} onStart={onStart} onChoose={onChoose} opponent="cfr-v2" />);
    expect(screen.queryByTestId('opponent-math')).toBeNull();
    expect(screen.queryByTestId('opponent-cfr-v2')).toBeNull();
    expect(onChoose).toHaveBeenCalledWith('cfr-v2');
    fireEvent.click(screen.getByTestId('start-cash'));
    expect(onStart).toHaveBeenLastCalledWith(CASH, 'cfr-v2');
  });

  it('shows the download of a fixed opponent without a choice', () => {
    render(
      <StartScreen
        seed={1}
        onStart={vi.fn()}
        opponent="cfr"
        progress={{ opponent: 'cfr', received: 10, total: 100 }}
      />,
    );
    expect(screen.getByTestId('start-loading').textContent).toContain('10%');
  });

  it('lets the player choose her character among nine, with her line and how hard she is', () => {
    const onCharacter = vi.fn();
    render(
      <StartScreen seed={1} onStart={vi.fn()} character="mallorca" onCharacter={onCharacter} />,
    );
    const choices = screen.getAllByTestId(/^character-/);
    expect(choices.map((node) => node.getAttribute('data-testid'))).toEqual([
      'character-mallorca',
      'character-ingrid',
      'character-mira',
      'character-nina',
      'character-lola',
      'character-sol',
      'character-rita',
      'character-vera',
      'character-greta',
    ]);
    expect(screen.getByTestId('character-mallorca').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('character-ingrid').textContent).toContain(
      'A professional. Nothing rattles her.',
    );
    expect(screen.getByTestId('character-greta').textContent).toContain('Patient');
    expect(screen.getByTestId('character-ingrid').textContent).toContain('The toughest');
    fireEvent.click(screen.getByTestId('character-nina'));
    expect(onCharacter).toHaveBeenCalledWith('nina');
  });

  it('greets the player in the words of the chosen character, under her name', () => {
    render(<StartScreen seed={1} onStart={vi.fn()} character="lola" onCharacter={vi.fn()} />);
    const frame = screen.getByTestId('tonight-face');
    expect(frame.textContent).toContain('Finally! Deal me in, I feel lucky.');
    expect(frame.querySelector('img')?.getAttribute('alt')).toBe('Lola');
  });

  it('has the copy of the spec for every character, without capitals or dashes', () => {
    const copy: Record<string, [string, string, string]> = {
      mallorca: [
        'Warm and curious. Opens up when the cards are kind.',
        'A fair fight',
        "Oh, it's you. Sit, I'll deal.",
      ],
      ingrid: ['A professional. Nothing rattles her.', 'The toughest', 'Your blind.'],
      mira: ['Kind and easy-going.', 'Comfortable', 'Shall we? No hurry.'],
      nina: [
        'Anxious and exacting. Hates her own mistakes.',
        'A gentle start',
        'Um, hi. Go easy on me?',
      ],
      lola: [
        'Quick to laugh, quick to take offence.',
        'A wild ride',
        'Finally! Deal me in, I feel lucky.',
      ],
      sol: [
        'Cheerful and bold. Loves a gamble.',
        'Lively',
        "Ooh, a new face! Let's make it interesting.",
      ],
      rita: [
        'Brash and stubborn. Never backs down.',
        'Relentless',
        "Sit down. I'm not going easy on you.",
      ],
      vera: [
        'Sharp-tongued, but her nerves betray her.',
        'Prickly',
        "You're late. Shuffle properly, please.",
      ],
      greta: ['Quiet and careful. Waits for her moment.', 'Patient', "Good evening. Let's begin."],
    };
    const characters = en.start.characters as Record<string, Record<string, string>>;
    expect(Object.keys(characters)).toEqual(Object.keys(copy));
    for (const [key, [line, hard, hello]] of Object.entries(copy)) {
      const c = characters[key];
      expect(c?.name).toBe(key[0]?.toUpperCase() + key.slice(1));
      expect([c?.line, c?.hard, c?.hello]).toEqual([line, hard, hello]);
      for (const text of Object.values(c ?? {})) {
        expect(text).not.toMatch(/[\u2013\u2014]/);
        expect(text).not.toMatch(/\b[A-Z]{2,}\b/);
      }
    }
  });

  it('hides the coach switch when the coach is not offered', () => {
    render(<StartScreen seed={1} onStart={vi.fn()} />);
    expect(screen.queryByTestId('start-coach')).toBeNull();
  });

  it('tells which opponent was chosen as soon as it is chosen', () => {
    const onChoose = vi.fn();
    render(<StartScreen seed={42} onStart={vi.fn()} onChoose={onChoose} finePointer />);
    fireEvent.click(screen.getByTestId('opponent-cfr-v2'));
    expect(onChoose).toHaveBeenCalledWith('cfr-v2');
  });

  it('offers the v2 solver where a fine pointer is present', () => {
    const onStart = vi.fn();
    render(<StartScreen seed={42} onStart={onStart} finePointer />);
    fireEvent.click(screen.getByTestId('opponent-cfr-v2'));
    expect(screen.getByTestId('opponent-cfr-v2').textContent).toBe(en.start.opponents['cfr-v2']);
    fireEvent.click(screen.getByTestId('start-cash'));
    expect(onStart).toHaveBeenLastCalledWith(CASH, 'cfr-v2');
    expect(screen.getByTestId('start-loading')).toBeTruthy();
  });

  it('hides the v2 solver on a touch screen', () => {
    render(<StartScreen seed={42} onStart={vi.fn()} finePointer={false} />);
    expect(screen.queryByTestId('opponent-cfr-v2')).toBeNull();
    expect(screen.getByTestId('opponent-cfr')).toBeTruthy();
  });

  it('says good night with a title and a line in place of the tagline', () => {
    const { container } = render(<StartScreen seed={1} onStart={vi.fn()} farewell />);
    const farewell = screen.getByTestId('farewell');
    expect(farewell.querySelector('.tonight-farewell-title')?.textContent).toBe('Sleep well.');
    expect(farewell.textContent).toContain('The table will be here.');
    expect(container.textContent).not.toContain(en.start.tagline);
  });

  it('is Tonight: her face in a frame with her greeting, the opponent and the coach', () => {
    render(<StartScreen seed={1} onStart={vi.fn()} onToggleCoach={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Tonight');
    const frame = screen.getByTestId('tonight-face');
    expect(frame.querySelector('img')?.getAttribute('alt')).toBe('Mallorca');
    expect(frame.textContent).toContain("Hi. I'm Mallorca.");
    expect((screen.getByTestId('start-coach') as HTMLInputElement).getAttribute('role')).toBe(
      'switch',
    );
  });

  it('frames her name instead of her face when the face is off', () => {
    render(<StartScreen seed={1} onStart={vi.fn()} face={false} />);
    const frame = screen.getByTestId('tonight-face');
    expect(frame.querySelector('img')).toBeNull();
    expect(frame.textContent).toContain('Mallorca');
  });

  it('shows the tagline by default', () => {
    const { container } = render(<StartScreen seed={1} onStart={vi.fn()} />);
    expect(screen.queryByTestId('farewell')).toBeNull();
    expect(container.textContent).toContain(en.start.tagline);
  });

  it('sits over the dimmed room', () => {
    render(<StartScreen seed={1} onStart={vi.fn()} />);
    expect(screen.getByTestId('scene').classList.contains('scene-dimmed')).toBe(true);
  });
});
