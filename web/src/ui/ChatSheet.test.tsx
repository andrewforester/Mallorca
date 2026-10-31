import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatSheet } from './ChatSheet.tsx';

afterEach(cleanup);

function sheet() {
  render(<ChatSheet lines={[]} onSay={vi.fn()} onQuick={vi.fn()} />);
  return screen.getByTestId('chat-open');
}

describe('ChatSheet', () => {
  it('opens from the chat button and shows the chat', () => {
    const button = sheet();
    expect(button.getAttribute('aria-label')).toBe('Chat with Mallorca');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('chat-sheet')).toBeNull();
    fireEvent.click(button);
    const dialog = screen.getByTestId('chat-sheet');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Chat with Mallorca');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('chat-input')).not.toBeNull();
  });

  it('closes and returns focus to the chat button', () => {
    const button = sheet();
    fireEvent.click(button);
    const close = screen.getByTestId('chat-close');
    expect(close.getAttribute('aria-label')).toBe('Close chat');
    fireEvent.click(close);
    expect(screen.queryByTestId('chat-sheet')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('closes on Escape', () => {
    const button = sheet();
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByTestId('chat-sheet'), { key: 'Escape' });
    expect(screen.queryByTestId('chat-sheet')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
