import { cleanup, render, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { createSession, inProcessBot, TOURNAMENT } from '../../game/index.ts';
import type { Session } from '../../game/index.ts';
import type { Cue } from './cues.ts';
import type { SoundPlayer } from './player.ts';
import { useSoundCues } from './useSoundCues.ts';

afterEach(cleanup);

function recorder() {
  const plays: Array<[Cue, number]> = [];
  const player: SoundPlayer = {
    unlock: () => undefined,
    play: (cue, delay = 0) => void plays.push([cue, delay]),
  };
  return { plays, player };
}

function makeSession(): Session {
  return createSession({
    bot: inProcessBot(),
    seed: 42,
    botDelayMs: 0,
    humanSeat: 0,
    names: ['You', 'Mallorca'],
    mode: TOURNAMENT,
  });
}

function Probe(props: { session: Session; player: SoundPlayer; enabled: boolean }) {
  useSoundCues(props.session, props.player, props.enabled);
  return null;
}

describe('useSoundCues', () => {
  it('plays the deal and chips at the start of a hand, then the turn chime', async () => {
    const session = makeSession();
    const { plays, player } = recorder();
    render(<Probe session={session} player={player} enabled />);
    await session.getState().start(TOURNAMENT, 'math');
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    const cues = plays.map(([cue]) => cue);
    expect(cues.slice(0, 2)).toEqual(['deal', 'chips']);
    expect(cues).toContain('turn');
    expect(plays[0]).toEqual(['deal', 0]);
    expect(plays[1]).toEqual(['chips', 120]);
    session.getState().dispose();
  });

  it('plays nothing when disabled', async () => {
    const session = makeSession();
    const { plays, player } = recorder();
    render(<Probe session={session} player={player} enabled={false} />);
    await session.getState().start(TOURNAMENT, 'math');
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    expect(plays).toEqual([]);
    session.getState().dispose();
  });

  it('does not replay a log that already exists when it mounts', async () => {
    const session = makeSession();
    await session.getState().start(TOURNAMENT, 'math');
    await waitFor(() => expect(session.getState().phase).toBe('humanToAct'));
    const { plays, player } = recorder();
    render(<Probe session={session} player={player} enabled />);
    expect(plays).toEqual([]);
    session.getState().dispose();
  });

  it('plays the cues of a new session after the log shrinks', async () => {
    const first = makeSession();
    await first.getState().start(TOURNAMENT, 'math');
    await waitFor(() => expect(first.getState().phase).toBe('humanToAct'));
    const { plays, player } = recorder();
    const view = render(<Probe session={first} player={player} enabled />);
    const second = makeSession();
    view.rerender(<Probe session={second} player={player} enabled />);
    expect(plays).toEqual([]);
    await second.getState().start(TOURNAMENT, 'math');
    await waitFor(() => expect(second.getState().phase).toBe('humanToAct'));
    expect(plays.map(([cue]) => cue).slice(0, 2)).toEqual(['deal', 'chips']);
    first.getState().dispose();
    second.getState().dispose();
  });
});
