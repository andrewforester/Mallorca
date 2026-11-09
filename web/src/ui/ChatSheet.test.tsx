import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TalkButton, TalkLayer } from './ChatSheet.tsx';

afterEach(cleanup);

describe('TalkButton', () => {
  it('says Talk, names the chat for screen readers and reports the toggle', () => {
    const onToggle = vi.fn();
    const view = render(<TalkButton open={false} onToggle={onToggle} />);
    const button = screen.getByTestId('chat-open');
    expect(button.textContent).toBe('Talk');
    expect(button.getAttribute('aria-label')).toBe('Chat with Mallorca');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
    view.rerender(<TalkButton open onToggle={onToggle} />);
    expect(screen.getByTestId('chat-open').getAttribute('aria-expanded')).toBe('true');
  });
});

describe('TalkLayer', () => {
  function layer(onClose = vi.fn()) {
    render(<TalkLayer lines={[]} onSay={vi.fn()} onQuick={vi.fn()} onClose={onClose} />);
    return onClose;
  }

  it('is a named section with the chat and puts the cursor in the field', () => {
    layer();
    const section = screen.getByTestId('chat-sheet');
    expect(section.tagName).toBe('SECTION');
    expect(section.getAttribute('aria-label')).toBe('Chat with Mallorca');
    expect(document.activeElement).toBe(screen.getByTestId('chat-input'));
  });

  it('closes by Hide and by Escape', () => {
    const onClose = layer();
    const hide = screen.getByTestId('chat-close');
    expect(hide.textContent).toBe('Hide');
    expect(hide.getAttribute('aria-label')).toBe('Close chat');
    fireEvent.click(hide);
    fireEvent.keyDown(screen.getByTestId('chat-sheet'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
