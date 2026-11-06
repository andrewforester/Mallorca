import { useEffect, useRef, useState } from 'preact/hooks';

export interface Hold {
  holding: boolean;
  start: () => void;
  stop: () => void;
}

export function useHold(ms: number, onDone: () => void): Hold {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const stop = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const start = () => {
    if (timer.current !== null) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      done.current();
    }, ms);
  };
  useEffect(() => stop, []);
  return { holding, start, stop };
}
