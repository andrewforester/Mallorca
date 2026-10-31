import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CASH, createSession, inProcessBot } from '../../game/index.ts';
import type { BotClient, Session } from '../../game/index.ts';
import { EmotionDebug } from './EmotionDebug.tsx';
import { COPY } from './copy.ts';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function explainingBot(): BotClient {
  const inner = inProcessBot();
  return {
    ...inner,
    select: (opponent) => Promise.resolve(opponent),
    decide: async (legal, style, explain) => {
      const decision = await inner.decide(legal, style);
      if (explain !== true) return decision;
      const moves = [{ kind: 'fold' as const }, decision.action];
      return {
        ...decision,
        breakdown: { moves, base: [0.25, 0.75], styled: [0.1, 0.9], chosen: 1 },
      };
    },
  };
}

async function seated(debug = true): Promise<Session> {
  const session = createSession({
    bot: explainingBot(),
    seed: 42,
    botDelayMs: 0,
    humanSeat: 0,
    names: ['You', 'Mallorca'],
    mode: CASH,
    now: () => 0,
    debug,
  });
  await session.getState().start(CASH, 'cfr');
  return session;
}

async function opened(session: Session) {
  render(<EmotionDebug session={session} />);
  fireEvent.click(screen.getByTestId('emotion-debug-toggle'));
  return screen.getByTestId('emotion-debug');
}

describe('EmotionDebug', () => {
  it('renders nothing for a session without the debug state', async () => {
    const { container } = render(<EmotionDebug session={await seated(false)} />);
    expect(container.innerHTML).toBe('');
  });

  it('opens and hides with the toggle and remembers it', async () => {
    const session = await seated();
    render(<EmotionDebug session={session} />);
    const toggle = screen.getByTestId('emotion-debug-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('emotion-debug')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('emotion-debug')).toBeTruthy();
    expect(localStorage.getItem('mallorca.debugPanel')).toBe('open');
    cleanup();
    render(<EmotionDebug session={session} />);
    expect(screen.getByTestId('emotion-debug')).toBeTruthy();
    fireEvent.click(screen.getByTestId('emotion-debug-toggle'));
    expect(screen.queryByTestId('emotion-debug')).toBeNull();
    expect(localStorage.getItem('mallorca.debugPanel')).toBe('closed');
  });

  it('switches her personality and starts her feeling over', async () => {
    const session = await seated();
    const setPersonality = vi.spyOn(session.getState(), 'setPersonality');
    const resetFeeling = vi.spyOn(session.getState(), 'resetFeeling');
    await opened(session);
    const lola = screen.getByTestId('debug-personality-lola');
    expect(screen.getByTestId('debug-personality-mallorca').getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(lola);
    expect(setPersonality).toHaveBeenCalledWith('lola');
    expect(lola.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('debug-reset'));
    expect(resetFeeling).toHaveBeenCalled();
  });

  it('turns a Big Five slider into a custom personality', async () => {
    const session = await seated();
    const setPersonality = vi.spyOn(session.getState(), 'setPersonality');
    await opened(session);
    fireEvent.input(screen.getByLabelText(COPY.bigFive.neuroticism), { target: { value: '0.9' } });
    expect(setPersonality).toHaveBeenCalledWith(
      expect.objectContaining({ bigFive: expect.objectContaining({ neuroticism: 0.9 }) }),
    );
  });

  it('says no style was sent before her first decision', async () => {
    await opened(await seated());
    expect(within(screen.getByTestId('debug-style')).getByText(COPY.notSent)).toBeTruthy();
  });

  it('shows her emotions, mood, load and style', async () => {
    const session = await seated();
    await act(() => session.getState().act({ kind: 'passive' }));
    await opened(session);
    const emotions = screen.getByTestId('debug-emotions');
    expect(within(emotions).getByText(COPY.emotion.anger)).toBeTruthy();
    expect(within(screen.getByTestId('debug-mood')).getAllByText(/^P [-\d.]+/)[0]).toBeTruthy();
    expect(within(screen.getByTestId('debug-load')).getByText(COPY.load.overload)).toBeTruthy();
    const style = screen.getByTestId('debug-style');
    expect(within(style).getByText(COPY.style.looseness)).toBeTruthy();
    expect(within(style).getByText(COPY.sent.tightness)).toBeTruthy();
  });

  it('shows the last decision with the blueprint and the styled shares', async () => {
    const session = await seated();
    await act(() => session.getState().act({ kind: 'passive' }));
    const panel = await opened(session);
    const decision = within(panel).getByTestId('debug-decision');
    expect(within(decision).getByText('25%')).toBeTruthy();
    expect(within(decision).getByText('90%')).toBeTruthy();
    expect(decision.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
  });

  it('lists the journal newest first with the reasons of each impulse', async () => {
    const session = await seated();
    await opened(session);
    const items = within(screen.getByTestId('debug-journal')).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.textContent).toContain(COPY.event.deal);
  });
});
