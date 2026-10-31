import { useEffect, useRef, useState } from 'preact/hooks';
import type { LogEntry } from '../game/index.ts';

type Actions = [LogEntry | null, LogEntry | null];

export const HOLD_MS = 900;

export interface HeldActions {
  actions: Actions;
  holding: boolean;
}

export function useHeldActions(
  actions: Actions,
  closing: Actions,
  board: number,
  ms = HOLD_MS,
): HeldActions {
  const last = useRef(board);
  const held = useRef<Actions | null>(null);
  const [, tick] = useState(0);
  const acted = actions[0] !== null || actions[1] !== null;
  if (acted || board < last.current) {
    held.current = null;
  } else if (board > last.current) {
    held.current = closing[0] !== null || closing[1] !== null ? closing : null;
  }
  useEffect(() => {
    last.current = board;
    if (held.current === null) {
      return;
    }
    const timer = setTimeout(() => {
      held.current = null;
      tick((n) => n + 1);
    }, ms);
    return () => clearTimeout(timer);
  }, [actions[0], actions[1], board, ms]);
  const current = held.current;
  return current === null ? { actions, holding: false } : { actions: current, holding: true };
}
