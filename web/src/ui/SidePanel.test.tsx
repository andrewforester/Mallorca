import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry } from '../game/index.ts';
import { SidePanel } from './SidePanel.tsx';

afterEach(cleanup);

const LOG: LogEntry[] = [{ key: 'handStarted', params: { number: 1, small: 10, big: 20 } }];

function panel(chat: boolean) {
  render(
    <SidePanel
      log={LOG}
      names={['You', 'Mallorca']}
      humanSeat={0}
      chat={chat ? { lines: [], onSay: vi.fn(), onQuick: vi.fn() } : null}
    />,
  );
}

describe('SidePanel', () => {
  it('shows only the hand log without chat', () => {
    panel(false);
    expect(screen.getByTestId('hand-log')).not.toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByTestId('chat-input')).toBeNull();
  });

  it('switches between Log and Chat and keeps the hand log', () => {
    panel(true);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Log', 'Chat']);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('chat-panel').hidden).toBe(true);
    fireEvent.click(screen.getByTestId('tab-chat'));
    expect(screen.getByTestId('tab-chat').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('chat-panel').hidden).toBe(false);
    const log = screen.getByTestId('hand-log');
    expect(log.closest('[hidden]')).not.toBeNull();
    expect(log.textContent).toContain('Hand 1, blinds 10/20');
    fireEvent.click(screen.getByTestId('tab-log'));
    expect(screen.getByTestId('hand-log').closest('[hidden]')).toBeNull();
  });
});
