import { useEffect, useRef, useState } from 'preact/hooks';

type Bets = [number, number];

export const SWEEP_MS = 300;

export function useSweep(bets: Bets, collected: number, ms = SWEEP_MS): Bets {
  const last = useRef({ bets, collected });
  const held = useRef<Bets | null>(null);
  const [, tick] = useState(0);
  const standing = bets[0] > 0 || bets[1] > 0;
  const before = last.current;
  if (standing || collected < before.collected) {
    held.current = null;
  } else if (before.bets[0] > 0 || before.bets[1] > 0) {
    held.current = collected > before.collected ? before.bets : null;
  }
  useEffect(() => {
    last.current = { bets, collected };
    if (held.current === null) {
      return;
    }
    const timer = setTimeout(() => {
      held.current = null;
      tick((n) => n + 1);
    }, ms);
    return () => clearTimeout(timer);
  }, [bets[0], bets[1], collected, ms]);
  return held.current ?? bets;
}
