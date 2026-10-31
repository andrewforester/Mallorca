import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CASH,
  createSession,
  inProcessBot,
  memoryStore,
  toViewModel,
  TOURNAMENT,
} from '../game/index.ts';
import { App } from './App.tsx';
import { readSound } from './preferences.ts';
import type { SoundPlayer } from './sound/player.ts';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function setup(mode = TOURNAMENT, store = memoryStore(), autoNext?: boolean, player?: SoundPlayer) {
  const session = createSession({
    bot: inProcessBot(),
    seed: 42,
    botDelayMs: 0,
    humanSeat: 0,
    names: ['You', 'Mallorca'],
    mode,
  });
  const onNewGame = vi.fn();
  render(
    <App
      session={session}
      store={store}
      humanSeat={0}
      onNewGame={onNewGame}
      onLeaveTonight={vi.fn()}
      autoNext={autoNext}
      player={player}
    />,
  );
  return { session, onNewGame };
}

describe('App sound toggles', () => {
  it('keeps the status bar button, the menu checkbox and storage in step', async () => {
    const { session } = setup();
    fireEvent.click(screen.getByTestId('start-tournament'));
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    const button = screen.getByTestId('sound-toggle');
    const box = screen.getByTestId('sound') as HTMLInputElement;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(box.checked).toBe(true);
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(box.checked).toBe(false);
    expect(readSound()).toBe(false);
    fireEvent.click(box);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(readSound()).toBe(true);
    session.getState().dispose();
  });
});

describe('App sound', () => {
  function recorder() {
    const unlock = vi.fn();
    const plays: string[] = [];
    const player: SoundPlayer = { unlock, play: (cue) => void plays.push(cue) };
    return { unlock, plays, player };
  }

  it('unlocks the player when a start button is clicked', async () => {
    const { unlock, player } = recorder();
    const { session } = setup(TOURNAMENT, memoryStore(), undefined, player);
    expect(unlock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('start-tournament'));
    expect(unlock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    session.getState().dispose();
  });

  it('does not unlock the player on the start click while sound is off', async () => {
    localStorage.setItem('mallorca.sound', 'off');
    const { unlock, player } = recorder();
    const { session } = setup(TOURNAMENT, memoryStore(), undefined, player);
    fireEvent.click(screen.getByTestId('start-tournament'));
    expect(unlock).not.toHaveBeenCalled();
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    session.getState().dispose();
  });

  it('unlocks the player when sound is switched on and on every human action', async () => {
    localStorage.setItem('mallorca.sound', 'off');
    const { unlock, player } = recorder();
    const { session } = setup(TOURNAMENT, memoryStore(), false, player);
    fireEvent.click(screen.getByTestId('start-tournament'));
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    expect(unlock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('sound-toggle'));
    expect(unlock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('sound-toggle'));
    expect(unlock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('sound-toggle'));
    expect(unlock).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId('fold'));
    expect(unlock).toHaveBeenCalledTimes(3);
    session.getState().dispose();
  });

  it('plays cues while sound is on and none once it is switched off', async () => {
    const { plays, player } = recorder();
    const { session } = setup(TOURNAMENT, memoryStore(), false, player);
    fireEvent.click(screen.getByTestId('start-tournament'));
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    expect(plays).toContain('turn');
    fireEvent.click(screen.getByTestId('sound-toggle'));
    const before = plays.length;
    fireEvent.click(screen.getByTestId('fold'));
    await waitFor(() => expect(screen.queryByTestId('next-hand')).not.toBeNull());
    expect(plays).toHaveLength(before);
    session.getState().dispose();
  });
});

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function foldFirstHand(session: ReturnType<typeof setup>['session']) {
  fireEvent.click(screen.getByTestId('start-tournament'));
  await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
  fireEvent.click(screen.getByTestId('fold'));
  await waitFor(() => expect(screen.queryByTestId('next-hand')).not.toBeNull());
}

describe('App auto next hand', () => {
  it('moves to the next hand by itself a second after a fold', async () => {
    localStorage.clear();
    const { session } = setup();
    await foldFirstHand(session);
    expect(screen.getByTestId('hand-number').textContent).toBe('Hand 1');
    await waitFor(() => expect(screen.getByTestId('hand-number').textContent).toBe('Hand 2'), {
      timeout: 2500,
    });
    session.getState().dispose();
  });

  it('waits for the player when auto next hand is switched off in the menu', async () => {
    localStorage.clear();
    const { session } = setup();
    fireEvent.click(screen.getByTestId('start-tournament'));
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    const toggle = screen.getByTestId('auto-next') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(localStorage.getItem('mallorca.autoNext')).toBe('off');
    fireEvent.click(screen.getByTestId('fold'));
    await waitFor(() => expect(screen.queryByTestId('next-hand')).not.toBeNull());
    await pause(1300);
    expect(screen.queryByTestId('next-hand')).not.toBeNull();
    expect(screen.getByTestId('hand-number').textContent).toBe('Hand 1');
    session.getState().dispose();
    localStorage.clear();
  });

  it('does not skip a hand when Next hand is clicked before the timer', async () => {
    localStorage.clear();
    const { session } = setup();
    await foldFirstHand(session);
    fireEvent.click(screen.getByTestId('next-hand'));
    await waitFor(() => expect(screen.getByTestId('hand-number').textContent).toBe('Hand 2'));
    await pause(1300);
    expect(screen.getByTestId('hand-number').textContent).toBe('Hand 2');
    session.getState().dispose();
  });

  it('pauses while the hand log is open and resumes when it closes', async () => {
    localStorage.clear();
    const { session } = setup();
    await foldFirstHand(session);
    fireEvent.click(screen.getByTestId('hand-log-toggle'));
    await pause(1300);
    expect(session.getState().phase).toBe('handOver');
    expect(screen.getByTestId('hand-number').textContent).toBe('Hand 1');
    fireEvent.click(screen.getByTestId('hand-log-close'));
    await waitFor(() => expect(screen.getByTestId('hand-number').textContent).toBe('Hand 2'), {
      timeout: 2500,
    });
    session.getState().dispose();
  });

  it('stays put when the page turns auto next hand off', async () => {
    localStorage.clear();
    const { session } = setup(TOURNAMENT, memoryStore(), false);
    await foldFirstHand(session);
    await pause(1300);
    expect(screen.getByTestId('hand-number').textContent).toBe('Hand 1');
    session.getState().dispose();
  });
});

describe('App', () => {
  it('switches to the simple table from the menu and remembers it', async () => {
    localStorage.clear();
    const { session } = setup();
    expect(screen.getByTestId('scene').classList.contains('scene-simple')).toBe(false);
    fireEvent.click(screen.getByTestId('start-tournament'));
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    const handBefore = screen.getByTestId('hand-number').textContent;
    const toggle = screen.getByTestId('simple-table') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(screen.getByTestId('scene').classList.contains('scene-simple')).toBe(true);
    expect(localStorage.getItem('mallorca.tableStyle')).toBe('simple');
    expect(screen.getByTestId('hand-number').textContent).toBe(handBefore);
    expect(session.getState().phase).toBe('humanToAct');
    fireEvent.click(screen.getByTestId('simple-table'));
    expect(screen.getByTestId('scene').classList.contains('scene-simple')).toBe(false);
    expect(localStorage.getItem('mallorca.tableStyle')).toBe('room');
    session.getState().dispose();
    localStorage.clear();
  });

  it('opens on the simple table when it was chosen before', () => {
    localStorage.setItem('mallorca.tableStyle', 'simple');
    const { session } = setup();
    expect(screen.getByTestId('scene').classList.contains('scene-simple')).toBe(true);
    session.getState().dispose();
    localStorage.clear();
  });

  it('starts on the start screen and deals after Start', async () => {
    const { session } = setup();
    expect(screen.getByTestId('start-tournament')).not.toBeNull();
    fireEvent.click(screen.getByTestId('start-tournament'));
    await waitFor(() => expect(screen.queryByTestId('seat-0')).not.toBeNull());
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    expect(within(screen.getByTestId('seat-0')).getAllByTestId('card').length).toBe(2);
    expect(within(screen.getByTestId('seat-1')).getAllByTestId('card-back').length).toBe(2);
    const stacks =
      Number(screen.getByTestId('stack-0').textContent) +
      Number(screen.getByTestId('stack-1').textContent);
    const bets = screen.queryAllByTestId(/^bet-/).length;
    expect(bets).toBeGreaterThan(0);
    const view = toViewModel(session.getState(), 0);
    const chips = view.seats.reduce((sum, seat) => sum + seat.stack + seat.bet, view.pot.collected);
    expect(stacks).toBeLessThan(chips);
    expect(screen.queryByTestId('hand-log')).toBeNull();
    expect(screen.queryByTestId('hand-log-menu')).toBeNull();
    session.getState().dispose();
  });

  it('opens the hand log from the status bar and returns focus on close', async () => {
    const { session } = setup();
    fireEvent.click(screen.getByTestId('start-tournament'));
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    const toggle = screen.getByTestId('hand-log-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByTestId('hand-log')).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe(screen.getByTestId('hand-log').id);
    expect(screen.getByTestId('hand-log').id).not.toBe('');
    expect(document.activeElement).toBe(screen.getByTestId('hand-log-close'));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('hand-log')).toBeNull());
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    fireEvent.click(screen.getByTestId('hand-log-close'));
    expect(screen.queryByTestId('hand-log')).toBeNull();
    session.getState().dispose();
  });

  it('closes the hand log when the menu opens', async () => {
    const { session } = setup();
    fireEvent.click(screen.getByTestId('start-tournament'));
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    fireEvent.click(screen.getByTestId('hand-log-toggle'));
    expect(screen.getByTestId('hand-log')).not.toBeNull();
    const summary = screen.getByText('Menu');
    const menu = summary.closest('details') as HTMLDetailsElement;
    fireEvent.click(summary);
    await waitFor(() => expect(screen.queryByTestId('hand-log')).toBeNull());
    expect(menu.open).toBe(true);
    session.getState().dispose();
  });

  it('plays a fold to the next hand', async () => {
    const { session } = setup();
    fireEvent.click(screen.getByTestId('start-tournament'));
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    fireEvent.click(screen.getByTestId('fold'));
    await waitFor(() => expect(screen.queryByTestId('next-hand')).not.toBeNull());
    fireEvent.click(screen.getByTestId('next-hand'));
    await waitFor(() => expect(screen.queryByTestId('next-hand')).toBeNull());
    session.getState().dispose();
  });

  it('shows the running result and a leave button in a cash game', async () => {
    const { session, onNewGame } = setup(CASH);
    fireEvent.click(screen.getByTestId('start-cash'));
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    expect(screen.getByTestId('leave').hasAttribute('disabled')).toBe(true);
    session.setState({ phase: 'handOver', session: { hands: 1, net: 250 } });
    await waitFor(() => expect(screen.getByTestId('session-result').textContent).toBe('+12.5 bb'));
    expect(screen.queryByTestId('blinds')).not.toBeNull();
    expect(screen.queryByTestId('leave')?.hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByTestId('leave'));
    await waitFor(() => expect(screen.queryByTestId('session-over')).not.toBeNull());
    expect(screen.getByTestId('session-over').textContent).toContain('+12.5 bb over 1 hand');
    fireEvent.click(screen.getByTestId('play-again'));
    expect(onNewGame).toHaveBeenCalledOnce();
    session.getState().dispose();
  });

  it('closes the hand log when the session ends', async () => {
    const { session } = setup(CASH);
    fireEvent.click(screen.getByTestId('start-cash'));
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    fireEvent.click(screen.getByTestId('hand-log-toggle'));
    expect(screen.getByTestId('hand-log')).not.toBeNull();
    session.setState({ phase: 'handOver', session: { hands: 1, net: 250 } });
    await waitFor(() =>
      expect(screen.queryByTestId('leave')?.hasAttribute('disabled')).toBe(false),
    );
    fireEvent.click(screen.getByTestId('hand-log-close'));
    fireEvent.click(screen.getByTestId('hand-log-toggle'));
    fireEvent.click(screen.getByTestId('leave'));
    await waitFor(() => expect(screen.queryByTestId('session-over')).not.toBeNull());
    expect(screen.queryByTestId('hand-log')).toBeNull();
    session.getState().dispose();
  });

  it('has no leave button or session result in a tournament', async () => {
    const { session } = setup();
    fireEvent.click(screen.getByTestId('start-tournament'));
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    expect(screen.queryByTestId('leave')).toBeNull();
    expect(screen.queryByTestId('session-result')).toBeNull();
    session.getState().dispose();
  });

  it('clears the history only on the second tap and resets when the menu closes', async () => {
    const store = memoryStore();
    const clear = vi.spyOn(store, 'clear');
    const { session } = setup(CASH, store);
    fireEvent.click(screen.getByTestId('start-cash'));
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    const button = screen.getByTestId('clear-history');
    expect(button.textContent).toBe('Clear history');
    fireEvent.click(button);
    expect(clear).not.toHaveBeenCalled();
    expect(screen.getByTestId('clear-history').textContent).toBe('Tap again to clear');
    const menu = screen.getByText('Menu').closest('details') as HTMLDetailsElement;
    menu.open = true;
    menu.open = false;
    fireEvent(menu, new Event('toggle'));
    await waitFor(() =>
      expect(screen.getByTestId('clear-history').textContent).toBe('Clear history'),
    );
    fireEvent.click(screen.getByTestId('clear-history'));
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('clear-history'));
    await waitFor(() => expect(clear).toHaveBeenCalledOnce());
    expect(screen.getByTestId('clear-history').textContent).toBe('Clear history');
    session.getState().dispose();
  });
});

describe('App coach mode', () => {
  it('turns on from the start screen and shows the panel at the player turn', async () => {
    const { session } = setup();
    const box = screen.getByTestId('start-coach') as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(localStorage.getItem('mallorca.coach')).toBe('on');
    fireEvent.click(screen.getByTestId('start-tournament'));
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    await waitFor(() => expect(session.getState().coach.status).toBe('unavailable'));
    expect(screen.getByTestId('coach-status').textContent).toContain('not available');
    session.getState().dispose();
  });

  it('turns off from the menu', async () => {
    localStorage.setItem('mallorca.coach', 'on');
    const { session } = setup();
    fireEvent.click(screen.getByTestId('start-tournament'));
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    fireEvent.click(screen.getByTestId('coach-mode'));
    expect(session.getState().coach.status).toBe('off');
    expect(screen.queryByTestId('coach-status')).toBeNull();
    session.getState().dispose();
  });
});
