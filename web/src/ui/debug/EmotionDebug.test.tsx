import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CASH, createSession, inProcessBot, memoryStore } from '../../game/index.ts';
import type { BotClient, HandStore, Session } from '../../game/index.ts';
import { EmotionDebug } from './EmotionDebug.tsx';
import { CHARACTER_SHEETS } from '../../game/index.ts';
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
    decide: async (legal, bias, explain) => {
      const decision = await inner.decide(legal, bias);
      if (explain !== true) return decision;
      const moves = [{ kind: 'fold' as const }, decision.action];
      return {
        ...decision,
        breakdown: { moves, base: [0.25, 0.75], biased: [0.1, 0.9], chosen: 1 },
      };
    },
  };
}

async function seated(debug = true, store?: HandStore): Promise<Session> {
  const session = createSession({
    ...(store === undefined ? {} : { records: { store, sessionId: 's1', now: () => 'now' } }),
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

async function opened(session: Session, store: HandStore = memoryStore()) {
  render(<EmotionDebug session={session} store={store} />);
  fireEvent.click(screen.getByTestId('emotion-debug-toggle'));
  return screen.getByTestId('emotion-debug');
}

describe('EmotionDebug', () => {
  it('renders nothing for a session without the debug state', async () => {
    const { container } = render(
      <EmotionDebug store={memoryStore()} session={await seated(false)} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('opens and hides with the toggle and remembers it', async () => {
    const session = await seated();
    render(<EmotionDebug store={memoryStore()} session={session} />);
    const toggle = screen.getByTestId('emotion-debug-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('emotion-debug')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('emotion-debug')).toBeTruthy();
    expect(localStorage.getItem('mallorca.debugPanel')).toBe('open');
    cleanup();
    render(<EmotionDebug store={memoryStore()} session={session} />);
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

  it('lists every character by her name, with who she is in life', async () => {
    await opened(await seated());
    const boss = screen.getByTestId('debug-personality-toughBoss');
    expect(boss.textContent).toBe(CHARACTER_SHEETS.toughBoss.name);
    expect(boss.getAttribute('title')).toBe(CHARACTER_SHEETS.toughBoss.short);
    expect(screen.getAllByTestId(/^debug-personality-/)).toHaveLength(34);
  });

  it('turns a Big Five slider into a custom personality', async () => {
    const session = await seated();
    const setPersonality = vi.spyOn(session.getState(), 'setPersonality');
    await opened(session);
    fireEvent.input(screen.getByLabelText(COPY.bigFive.neuroticism), { target: { value: '0.9' } });
    expect(setPersonality).toHaveBeenCalledWith(
      expect.objectContaining({
        bigFive: expect.objectContaining({ neuroticism: 0.9 }),
        suppression: expect.any(Number),
      }),
    );
  });

  it('shows whom she blames, how she copes and how rash she gets, and no experience', async () => {
    await opened(await seated());
    for (const label of ['Blames herself', 'Coping', 'Urgency']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByLabelText('Poker experience')).toBeNull();
  });

  it('has no self-control slider, a character is her Big Five and her poker face habit', async () => {
    await opened(await seated());
    expect(screen.queryByLabelText('Self-control')).toBeNull();
    expect(screen.getByLabelText(COPY.suppression)).toBeTruthy();
  });

  it('says no bias was sent before her first decision', async () => {
    await opened(await seated());
    expect(within(screen.getByTestId('debug-bias')).getByText(COPY.notSent)).toBeTruthy();
  });

  it('shows her emotions, mood, load and bias', async () => {
    const session = await seated();
    await act(() => session.getState().act({ kind: 'passive' }));
    await opened(session);
    const emotions = screen.getByTestId('debug-emotions');
    expect(within(emotions).getByText(COPY.emotion.anger)).toBeTruthy();
    expect(within(screen.getByTestId('debug-mood')).getAllByText(/^P [-\d.]+/)[0]).toBeTruthy();
    const strain = within(screen.getByTestId('debug-load'));
    for (const label of [
      'Intensity',
      'Composure',
      'Negative strain',
      'Overload',
      'Reaches the play',
    ]) {
      expect(strain.getByText(label)).toBeTruthy();
    }
    expect(strain.getByText(COPY.part.mood)).toBeTruthy();
    expect(strain.getByText(COPY.emotion.fear)).toBeTruthy();
    expect(within(screen.getByTestId('debug-mood')).getByText(/^Approach /)).toBeTruthy();
    expect(within(screen.getByTestId('debug-mood')).getByText(/^Certainty /)).toBeTruthy();
    const bias = screen.getByTestId('debug-bias');
    expect(
      within(screen.getByTestId('debug-bias-now')).getByText(COPY.bias.looseness),
    ).toBeTruthy();
    expect(within(bias).getByText(COPY.sent.tightness)).toBeTruthy();
    for (const title of ['Now', 'Nature at rest', 'Push of her state', 'Sent to the bot']) {
      expect(within(bias).getByText(title)).toBeTruthy();
    }
    expect(within(screen.getByTestId('debug-style')).getByText(COPY.bias.looseness)).toBeTruthy();
    expect(within(screen.getByTestId('debug-push')).getByText(COPY.bias.looseness)).toBeTruthy();
  });

  it('shows the last decision with the blueprint and the biased shares', async () => {
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

  it('copies the hands of the session with her feelings', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const store = memoryStore();
    const session = await seated(true, store);
    await act(() => session.getState().act({ kind: 'fold' }));
    const panel = await opened(session, store);
    fireEvent.click(within(panel).getByRole('button', { name: COPY.journal.copy }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0]?.[0] ?? '';
    expect(text).toContain('Dealt to Mallorca');
    expect(text).toContain('she feels (hand over');
  });

  it('copies the hand still in play too', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const store = memoryStore();
    const session = await seated(true, store);
    const panel = await opened(session, store);
    fireEvent.click(within(panel).getByRole('button', { name: COPY.journal.copy }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0]?.[0]).toContain('*** HAND IN PROGRESS ***');
  });

  it('switches between her feelings and her conversation and remembers the tab', async () => {
    const session = await seated();
    const panel = await opened(session);
    expect(within(panel).queryByTestId('conversation-debug')).toBeNull();
    fireEvent.click(within(panel).getByRole('tab', { name: 'Conversation' }));
    expect(within(panel).getByTestId('conversation-debug')).toBeTruthy();
    expect(
      within(panel).getByRole('tab', { name: 'Conversation' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(localStorage.getItem('mallorca.debugTab')).toBe('conversation');
    fireEvent.click(within(panel).getByRole('tab', { name: 'Feelings' }));
    expect(within(panel).queryByTestId('conversation-debug')).toBeNull();
  });

  it('links a journal entry to the line it fed', async () => {
    const session = await seated();
    const panel = await opened(session);
    const entries = within(panel).getByTestId('debug-journal').querySelectorAll('li');
    expect([...entries].every((li) => li.id.startsWith('journal-'))).toBe(true);
  });

  it('opens the conversation tab from a journal link and the feelings tab back', async () => {
    const session = await seated();
    for (
      let i = 0;
      i < 60 && !session.getState().debug?.conversation.entries.some((e) => e.plan);
      i += 1
    ) {
      await act(async () => {
        await session.getState().act({ kind: 'passive' });
      });
    }
    const panel = await opened(session);
    const link = within(panel).getAllByRole('link', { name: 'Line' })[0] as HTMLElement;
    fireEvent.click(link);
    expect(within(panel).getByTestId('conversation-debug')).toBeTruthy();
    const back = within(panel)
      .getAllByRole('link')
      .find((a) => a.getAttribute('href')?.startsWith('#journal-'));
    fireEvent.click(back as HTMLElement);
    expect(within(panel).queryByTestId('conversation-debug')).toBeNull();
  });
});
