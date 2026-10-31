import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatLine } from '../game/index.ts';
import { Chat } from './Chat.tsx';

afterEach(cleanup);

const LINES: ChatLine[] = [
  { id: 1, speaker: 'mallorca', text: 'Your move.', handNumber: 1 },
  { id: 2, speaker: 'player', text: 'Thinking', handNumber: 1, undelivered: true },
];

function chat(lines: ChatLine[] = LINES) {
  const onSay = vi.fn();
  const onQuick = vi.fn();
  render(<Chat lines={lines} onSay={onSay} onQuick={onQuick} />);
  return { onSay, onQuick };
}

describe('Chat', () => {
  it('lists the conversation with speakers and marks an undelivered line', () => {
    chat();
    const items = screen.getAllByTestId('chat-line');
    expect(items.map((item) => item.dataset.speaker)).toEqual(['mallorca', 'player']);
    expect(items[0]?.textContent).toContain('Your move.');
    expect(items[1]?.textContent).toContain('Not delivered');
  });

  it('sends on Enter and clears the input', () => {
    const { onSay } = chat();
    const input = screen.getByTestId('chat-input') as HTMLInputElement;
    expect(input.getAttribute('placeholder')).toBe('Say something to Mallorca');
    expect(input.maxLength).toBe(200);
    fireEvent.input(input, { target: { value: '  Hello there  ' } });
    fireEvent.submit(input.form as HTMLFormElement);
    expect(onSay).toHaveBeenCalledWith('Hello there');
    expect(input.value).toBe('');
  });

  it('does not send an empty message', () => {
    const { onSay } = chat();
    const input = screen.getByTestId('chat-input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '   ' } });
    fireEvent.submit(input.form as HTMLFormElement);
    expect(onSay).not.toHaveBeenCalled();
  });

  it('sends quick phrases with their label', () => {
    const { onQuick } = chat();
    fireEvent.click(screen.getByTestId('quick-niceHand'));
    fireEvent.click(screen.getByTestId('quick-bluffing'));
    fireEvent.click(screen.getByTestId('quick-notThisTime'));
    expect(onQuick.mock.calls).toEqual([
      ['niceHand', 'Nice hand'],
      ['bluffing', "You're bluffing"],
      ['notThisTime', 'Not this time'],
    ]);
  });

  it('labels the send button', () => {
    chat([]);
    expect(screen.getByTestId('chat-send').textContent).toBe('Send');
  });
});
