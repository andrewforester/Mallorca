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
  onTells,
}: {
  conversation: boolean;
  onConversation: (on: boolean) => void;
  onTells: (level: string) => void;
}) {
  const preferences = usePreferences();
  return (
    <Settings
      preferences={preferences}
      conversation={conversation}
      onConversation={onConversation}
      onTells={onTells}
    />
  );
}

function settings(conversation = true) {
  const onConversation = vi.fn();
  const onTells = vi.fn();
  render(<Harness conversation={conversation} onConversation={onConversation} onTells={onTells} />);
  return { onConversation, onTells };
}

describe('Settings conversation', () => {
  it('shows the session state of conversation and tells, not the stored preference', () => {
    function Bound() {
      const preferences = usePreferences();
      return (
        <Settings preferences={preferences} conversation conversationOn={false} tells="hidden" />
      );
    }
    render(<Bound />);
    expect((screen.getByTestId('table-conversation') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId('tells') as HTMLSelectElement).value).toBe('hidden');
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

  it('picks the tells level and keeps it', () => {
    const { onTells } = settings();
    const select = screen.getByTestId('tells') as HTMLSelectElement;
    expect(select.value).toBe('subtle');
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      'Obvious',
      'Subtle',
      'Hidden',
    ]);
    expect(select.closest('label')?.textContent).toContain('Tells');
    fireEvent.change(select, { target: { value: 'obvious' } });
    expect(onTells).toHaveBeenCalledWith('obvious');
    expect(localStorage.getItem('mallorca.tells')).toBe('obvious');
  });

  it('still switches when storage throws', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, clear: () => undefined });
    const { onConversation, onTells } = settings();
    fireEvent.click(screen.getByTestId('table-conversation'));
    fireEvent.change(screen.getByTestId('tells'), { target: { value: 'hidden' } });
    expect(onConversation).toHaveBeenCalledWith(false);
    expect(onTells).toHaveBeenCalledWith('hidden');
    expect((screen.getByTestId('table-conversation') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId('tells') as HTMLSelectElement).value).toBe('hidden');
  });

  it('hides conversation settings when conversation is not available', () => {
    settings(false);
    expect(screen.queryByTestId('table-conversation')).toBeNull();
    expect(screen.queryByTestId('tells')).toBeNull();
    expect(screen.getByTestId('simple-table')).not.toBeNull();
  });
});
