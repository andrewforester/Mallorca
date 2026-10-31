import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CASH, createSession, inProcessBot, memoryStore } from '../game/index.ts';
import type { BotClient, TalkClient } from '../game/index.ts';
import { App } from './App.tsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function solverBot(): BotClient {
  return { ...inProcessBot(), select: (opponent) => Promise.resolve(opponent) };
}

function client(): TalkClient & { reply: ReturnType<typeof vi.fn> } {
  return {
    enabled: true,
    line: vi.fn(() => Promise.resolve(null)),
    reply: vi.fn(() => Promise.resolve({ text: 'Is that so?', signals: [] })),
    summary: vi.fn(() => Promise.resolve()),
  };
}

async function seated(talk: TalkClient) {
  const session = createSession({
    bot: solverBot(),
    seed: 42,
    botDelayMs: 0,
    humanSeat: 0,
    names: ['You', 'Mallorca'],
    mode: CASH,
    talk,
  });
  render(
    <App
      session={session}
      store={memoryStore()}
      humanSeat={0}
      onNewGame={vi.fn()}
      onLeaveTonight={vi.fn()}
      autoNext={false}
    />,
  );
  fireEvent.click(screen.getByTestId('opponent-cfr'));
  fireEvent.click(screen.getByTestId('start-cash'));
  await waitFor(() => expect(session.getState().talk.available).toBe(true));
  return session;
}

describe('App table talk', () => {
  it('sends what the player types and shows her answer', async () => {
    const talk = client();
    const session = await seated(talk);
    const input = screen.getAllByTestId('chat-input')[0] as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'Show me your cards' } });
    fireEvent.submit(input.form as HTMLFormElement);
    await waitFor(() =>
      expect(session.getState().talk.lines.map((line) => line.text)).toContain('Is that so?'),
    );
    expect(talk.reply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('bubble-player')).not.toBeNull();
    session.getState().dispose();
  });

  it('switches talk off and on from the menu and keeps the choice', async () => {
    const session = await seated(client());
    fireEvent.click(screen.getByTestId('table-talk'));
    expect(session.getState().talk.on).toBe(false);
    expect(localStorage.getItem('mallorca.talk')).toBe('off');
    expect(screen.queryByTestId('chat-open')).toBeNull();
    fireEvent.change(screen.getByTestId('tells'), { target: { value: 'hidden' } });
    expect(session.getState().talk.level).toBe('hidden');
    fireEvent.click(screen.getByTestId('table-talk'));
    expect(session.getState().talk.on).toBe(true);
    expect(screen.getByTestId('chat-open')).not.toBeNull();
    session.getState().dispose();
  });

  it('shows no talk with a silent client', async () => {
    const session = createSession({
      bot: solverBot(),
      seed: 42,
      botDelayMs: 0,
      humanSeat: 0,
      names: ['You', 'Mallorca'],
      mode: CASH,
    });
    render(
      <App
        session={session}
        store={memoryStore()}
        humanSeat={0}
        onNewGame={vi.fn()}
        onLeaveTonight={vi.fn()}
        autoNext={false}
      />,
    );
    fireEvent.click(screen.getByTestId('opponent-cfr'));
    fireEvent.click(screen.getByTestId('start-cash'));
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    expect(screen.queryByTestId('chat-open')).toBeNull();
    expect(screen.queryByTestId('table-talk')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    session.getState().dispose();
  });
});
