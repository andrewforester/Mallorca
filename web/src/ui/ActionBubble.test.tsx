import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { LogEntry } from '../game/index.ts';
import { ActionBubble } from './ActionBubble.tsx';
import { actionKind } from './phrases.ts';

afterEach(cleanup);

const CASES: [LogEntry, string, string][] = [
  [{ key: 'check', params: {} }, 'passive', 'Check'],
  [{ key: 'call', params: { amount: 40 } }, 'passive', 'Call 40'],
  [{ key: 'bet', params: { amount: 80 } }, 'aggressive', 'Bet 80'],
  [{ key: 'raiseTo', params: { amount: 240 } }, 'aggressive', 'Raise to 240'],
  [{ key: 'allIn', params: {} }, 'aggressive', 'All-in'],
  [{ key: 'fold', params: {} }, 'fold', 'Fold'],
];

describe('actionKind', () => {
  it('sorts actions into passive, aggressive and fold', () => {
    for (const [entry, kind] of CASES) {
      expect(actionKind(entry)).toBe(kind);
    }
  });
});

describe('ActionBubble', () => {
  it('words the last action with a class for its kind', () => {
    for (const [entry, kind, text] of CASES) {
      render(<ActionBubble seat={0} entry={entry} thinking={false} />);
      const bubble = screen.getByTestId('action-0');
      expect(bubble.textContent).toBe(text);
      expect(bubble.classList.contains(`bubble-${kind}`)).toBe(true);
      cleanup();
    }
  });

  it('shows thinking over an earlier action', () => {
    render(<ActionBubble seat={1} entry={{ key: 'check', params: {} }} thinking />);
    expect(screen.getByTestId('thinking-1').textContent).toBe('Thinking…');
    expect(screen.queryByTestId('action-1')).toBeNull();
  });

  it('renders nothing without an action or thinking', () => {
    const { container } = render(<ActionBubble seat={1} entry={null} thinking={false} />);
    expect(container.innerHTML).toBe('');
  });
});
