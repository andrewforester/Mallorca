import { useEffect, useRef, useState } from 'preact/hooks';

export const NUDGE_MS = 450;

type Timer = ReturnType<typeof setTimeout> | null;

export interface Hold {
  holding: boolean;
  nudged: boolean;
  start: () => void;
  stop: () => void;
}

export function useHold(ms: number, onDone: () => void): Hold {
  const [holding, setHolding] = useState(false);
  const [nudged, setNudged] = useState(false);
  const timer = useRef<Timer>(null);
  const nudge = useRef<Timer>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    if (nudge.current !== null) clearTimeout(nudge.current);
    timer.current = null;
    nudge.current = null;
  };
  const stop = () => {
    if (timer.current === null) return;
    clear();
    setHolding(false);
    setNudged(true);
    nudge.current = setTimeout(() => {
      nudge.current = null;
      setNudged(false);
    }, NUDGE_MS);
  };
  const start = () => {
    if (timer.current !== null) return;
    clear();
    setNudged(false);
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      done.current();
    }, ms);
  };
  useEffect(() => clear, []);
  return { holding, nudged, start, stop };
}
