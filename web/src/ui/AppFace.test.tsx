import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CASH, createSession, inProcessBot, memoryStore } from '../game/index.ts';
import { App } from './App.tsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function start() {
  const session = createSession({
    bot: inProcessBot(),
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
    />,
  );
  fireEvent.click(screen.getByTestId('start-cash'));
  await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
  return session;
}

describe('her face at the table', () => {
  it('shows the still portrait in her seat when WebGL is missing', async () => {
    const session = await start();
    const seat = screen.getByTestId('face-seat');
    expect(seat.dataset.face).toBe('portrait');
    expect(seat.closest('[data-testid="seat-1"]')).not.toBeNull();
    expect(seat.querySelector('img')?.getAttribute('src')).toContain('avatar/portrait.webp');
    expect(session.getState().face.on).toBe(true);
  });

  it('turns off from the menu, keeps the choice and leaves the plaque', async () => {
    const session = await start();
    fireEvent.click(screen.getByTestId('face'));
    expect(screen.queryByTestId('face-seat')).toBeNull();
    expect(screen.getByTestId('seat-1')).not.toBeNull();
    expect(localStorage.getItem('mallorca.face')).toBe('off');
    expect(session.getState().face.on).toBe(false);
  });

  it('starts off when the stored choice is off', async () => {
    localStorage.setItem('mallorca.face', 'off');
    await start();
    expect(screen.queryByTestId('face-seat')).toBeNull();
    expect((screen.getByTestId('face') as HTMLInputElement).checked).toBe(false);
  });

  it('offers the voice off by default only where the browser can speak', async () => {
    await start();
    expect(screen.queryByTestId('voice')).toBeNull();
    cleanup();
    vi.stubGlobal('speechSynthesis', { getVoices: () => [], addEventListener: vi.fn() });
    await start();
    const voice = screen.getByTestId('voice') as HTMLInputElement;
    expect(voice.checked).toBe(false);
    fireEvent.click(voice);
    expect(localStorage.getItem('mallorca.voice')).toBe('on');
  });
});
