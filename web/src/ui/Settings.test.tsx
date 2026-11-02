import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Settings } from './Settings.tsx';
import { usePreferences } from './usePreferences.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function Harness({
  conversation,
  onConversation,
}: {
  conversation: boolean;
  onConversation: (on: boolean) => void;
}) {
  const preferences = usePreferences();
  return (
    <Settings
      preferences={preferences}
      conversation={conversation}
      onConversation={onConversation}
    />
  );
}

function settings(conversation = true) {
  const onConversation = vi.fn();
  render(<Harness conversation={conversation} onConversation={onConversation} />);
  return { onConversation };
}

describe('Settings conversation', () => {
  it('shows the session state of conversation, not the stored preference', () => {
    function Bound() {
      const preferences = usePreferences();
      return <Settings preferences={preferences} conversation conversationOn={false} />;
    }
    render(<Bound />);
    expect((screen.getByTestId('table-conversation') as HTMLInputElement).checked).toBe(false);
  });

  it('offers no tells setting: her readability is her own', () => {
    localStorage.setItem('mallorca.tells', 'obvious');
    settings();
    expect(screen.queryByTestId('tells')).toBeNull();
    expect(screen.queryByText('Tells')).toBeNull();
  });

  it('toggles table talk and keeps it', () => {
    const { onConversation } = settings();
    const toggle = screen.getByTestId('table-conversation') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(toggle.closest('label')?.textContent).toContain('Table talk');
    fireEvent.click(toggle);
    expect(onConversation).toHaveBeenCalledWith(false);
    expect(localStorage.getItem('mallorca.talk')).toBe('off');
    expect((screen.getByTestId('table-conversation') as HTMLInputElement).checked).toBe(false);
  });

  it('still switches when storage throws', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, clear: () => undefined });
    const { onConversation } = settings();
    fireEvent.click(screen.getByTestId('table-conversation'));
    expect(onConversation).toHaveBeenCalledWith(false);
    expect((screen.getByTestId('table-conversation') as HTMLInputElement).checked).toBe(false);
  });

  it('hides conversation settings when conversation is not available', () => {
    settings(false);
    expect(screen.queryByTestId('table-conversation')).toBeNull();
    expect(screen.getByTestId('simple-table')).not.toBeNull();
  });
});
