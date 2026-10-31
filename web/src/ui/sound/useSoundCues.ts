import { useEffect, useRef } from 'preact/hooks';
import type { Session } from '../../game/index.ts';
import { cuesFor, turnCue } from './cues.ts';
import type { SoundPlayer } from './player.ts';

const STAGGER_MS = 120;

export function useSoundCues(session: Session, player: SoundPlayer, enabled: boolean): void {
  const enabledRef = useRef(enabled);
  const playerRef = useRef(player);
  enabledRef.current = enabled;
  playerRef.current = player;
  useEffect(() => {
    const initial = session.getState();
    let seen = initial.log.length;
    let phase = initial.phase;
    let freeAt = 0;
    return session.subscribe((state) => {
      const previousPhase = phase;
      const fresh = state.log.slice(seen);
      seen = state.log.length;
      phase = state.phase;
      if (!enabledRef.current) return;
      const cues = cuesFor(fresh);
      const turn = turnCue(previousPhase, state.phase);
      if (turn !== null) cues.push(turn);
      for (const cue of cues) {
        const now = performance.now();
        const delay = Math.max(0, freeAt - now);
        freeAt = now + delay + STAGGER_MS;
        playerRef.current.play(cue, delay);
      }
    });
  }, [session]);
}
