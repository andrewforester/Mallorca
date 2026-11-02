import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWide } from './useWide.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Probe() {
  return <span data-testid="wide">{String(useWide())}</span>;
}

describe('useWide', () => {
  it('treats a short landscape screen as narrow, like the hand log', () => {
    const queries: string[] = [];
    vi.stubGlobal('matchMedia', (query: string) => {
      queries.push(query);
      return {
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      };
    });
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('wide').textContent).toBe('false');
    expect(queries[0]).toBe('(min-aspect-ratio: 1/1) and (min-height: 561px)');
  });
});
