import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CASH, createSession, inProcessBot, memoryStore } from '../game/index.ts';
import type { BotClient, ConversationClient } from '../game/index.ts';
import { App } from './App.tsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function solverBot(): BotClient {
  return { ...inProcessBot(), select: (opponent) => Promise.resolve(opponent) };
}

function client(): ConversationClient & { reply: ReturnType<typeof vi.fn> } {
  return {
    enabled: true,
    line: vi.fn(() => Promise.resolve(null)),
    reply: vi.fn(() => Promise.resolve({ text: 'Is that so?', signals: [] })),
    summary: vi.fn(() => Promise.resolve()),
  };
}

async function seated(conversation: ConversationClient) {
  const session = createSession({
    bot: solverBot(),
    seed: 42,
    botDelayMs: 0,
    humanSeat: 0,
    names: ['You', 'Mallorca'],
    mode: CASH,
    conversation,
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
  await waitFor(() => expect(session.getState().conversation.available).toBe(true));
  return session;
}

describe('App table talk', () => {
  it('sends what the player types and shows her answer', async () => {
    const conversation = client();
    const session = await seated(conversation);
    const input = screen.getAllByTestId('chat-input')[0] as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'Show me your cards' } });
    fireEvent.submit(input.form as HTMLFormElement);
    await waitFor(() =>
      expect(session.getState().conversation.lines.map((line) => line.text)).toContain(
        'Is that so?',
      ),
    );
    expect(conversation.reply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('bubble-player')).not.toBeNull();
    session.getState().dispose();
  });

  it('switches conversation off and on from the menu and keeps the choice', async () => {
    const session = await seated(client());
    fireEvent.click(screen.getByTestId('table-conversation'));
    expect(session.getState().conversation.on).toBe(false);
    expect(localStorage.getItem('mallorca.talk')).toBe('off');
    expect(screen.queryByTestId('chat-open')).toBeNull();
    fireEvent.click(screen.getByTestId('table-conversation'));
    expect(session.getState().conversation.on).toBe(true);
    expect(screen.getByTestId('chat-open')).not.toBeNull();
    session.getState().dispose();
  });

  it('shows no conversation with a silent client', async () => {
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
    expect(screen.queryByTestId('table-conversation')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    session.getState().dispose();
  });
});
