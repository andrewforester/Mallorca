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
  talk,
  onTalk,
  onTells,
}: {
  talk: boolean;
  onTalk: (on: boolean) => void;
  onTells: (level: string) => void;
}) {
  const preferences = usePreferences();
  return <Settings preferences={preferences} talk={talk} onTalk={onTalk} onTells={onTells} />;
}

function settings(talk = true) {
  const onTalk = vi.fn();
  const onTells = vi.fn();
  render(<Harness talk={talk} onTalk={onTalk} onTells={onTells} />);
  return { onTalk, onTells };
}

describe('Settings talk', () => {
  it('toggles table talk and keeps it', () => {
    const { onTalk } = settings();
    const toggle = screen.getByTestId('table-talk') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(toggle.closest('label')?.textContent).toContain('Table talk');
    fireEvent.click(toggle);
    expect(onTalk).toHaveBeenCalledWith(false);
    expect(localStorage.getItem('mallorca.talk')).toBe('off');
    expect((screen.getByTestId('table-talk') as HTMLInputElement).checked).toBe(false);
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
    const { onTalk, onTells } = settings();
    fireEvent.click(screen.getByTestId('table-talk'));
    fireEvent.change(screen.getByTestId('tells'), { target: { value: 'hidden' } });
    expect(onTalk).toHaveBeenCalledWith(false);
    expect(onTells).toHaveBeenCalledWith('hidden');
    expect((screen.getByTestId('table-talk') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId('tells') as HTMLSelectElement).value).toBe('hidden');
  });

  it('hides talk settings when talk is not available', () => {
    settings(false);
    expect(screen.queryByTestId('table-talk')).toBeNull();
    expect(screen.queryByTestId('tells')).toBeNull();
    expect(screen.getByTestId('simple-table')).not.toBeNull();
  });
});
