import { useEffect, useState } from 'preact/hooks';

const WIDE = '(min-aspect-ratio: 1/1) and (min-height: 561px)';

function matches(): boolean {
  return globalThis.matchMedia?.(WIDE).matches ?? true;
}

export function useWide(): boolean {
  const [wide, setWide] = useState(matches);
  useEffect(() => {
    const query = globalThis.matchMedia?.(WIDE);
    if (query === undefined) return undefined;
    const update = () => setWide(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return wide;
}
