import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry } from '../game/index.ts';
import { HandLogDrawer } from './HandLogDrawer.tsx';

afterEach(cleanup);

const names: [string, string] = ['You', 'Mallorca'];

function e(key: string, params: Record<string, string | number> = {}): LogEntry {
  return { key, params };
}

const OLD = [e('handStarted', { number: 1, small: 10, big: 20 }), e('fold', { seat: 1 })];
const HAND = [
  e('handStarted', { number: 2, small: 10, big: 20 }),
  e('post', { seat: 0, amount: 10 }),
  e('post', { seat: 1, amount: 20 }),
  e('raise', { seat: 0, amount: 60 }),
  e('call', { seat: 1, amount: 40 }),
  e('flop', { cards: 'As Td 3h', pot: 120 }),
  e('check', { seat: 1 }),
  e('bet', { seat: 0, amount: 80 }),
];

function setup(onClose = vi.fn(), entries = [...OLD, ...HAND]) {
  render(<HandLogDrawer entries={entries} names={names} humanSeat={0} onClose={onClose} />);
  return onClose;
}

describe('HandLogDrawer', () => {
  it('is a labelled dialog titled with the hand number', () => {
    setup();
    const drawer = screen.getByTestId('hand-log');
    expect(drawer.getAttribute('role')).toBe('dialog');
    expect(drawer.getAttribute('aria-label')).toBe('Hand log');
    expect(screen.getByRole('heading', { name: 'Hand 2' })).toBeTruthy();
  });

  it('lists the street headings in order', () => {
    setup();
    const headings = [...document.querySelectorAll('.hand-log-street-name')].map(
      (node) => node.textContent,
    );
    expect(headings).toEqual(['Preflop', 'Flop']);
  });

  it('shows the flop as three card chips and hides the preflop pot', () => {
    setup();
    const sections = document.querySelectorAll('section');
    expect(sections[0]?.querySelectorAll('.log-card').length).toBe(0);
    expect(sections[0]?.textContent).not.toContain('Pot');
    const chips = sections[1]?.querySelectorAll('.log-card') ?? [];
    expect(chips.length).toBe(3);
    expect(chips[0]?.textContent).toBe('A♠');
    expect(chips[2]?.classList.contains('log-card-red')).toBe(true);
    expect(chips[0]?.classList.contains('log-card-red')).toBe(false);
    expect(sections[1]?.textContent).toContain('Pot 120');
  });

  it('words tokens with the log line and marks aggression', () => {
    setup();
    const tokens = [...document.querySelectorAll('.log-token')];
    expect(tokens.some((node) => node.textContent === 'You bet 80')).toBe(true);
    const raise = tokens.find((node) => node.textContent === 'You raise to 60');
    expect(raise?.classList.contains('log-token-aggressive')).toBe(true);
    const call = tokens.find((node) => node.textContent === 'Mallorca calls 40');
    expect(call?.classList.contains('log-token-aggressive')).toBe(false);
  });

  it('shows only the current hand', () => {
    setup();
    expect(screen.queryByText('Hand 1')).toBeNull();
    expect(document.querySelectorAll('.log-token').length).toBe(6);
  });

  it('closes on Escape, scrim click and the close button', () => {
    const onClose = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('hand-log-scrim'));
    expect(onClose).toHaveBeenCalledTimes(2);
    const close = screen.getByTestId('hand-log-close');
    expect(close.getAttribute('aria-label')).toBe('Close hand log');
    expect(close.textContent).toBe('');
    expect(close.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('scrolls the body to the newest line when entries arrive', () => {
    const onClose = vi.fn();
    const view = render(
      <HandLogDrawer entries={HAND} names={names} humanSeat={0} onClose={onClose} />,
    );
    const body = document.querySelector('.hand-log-body') as HTMLElement;
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 640 });
    view.rerender(
      <HandLogDrawer
        entries={[...HAND, e('call', { seat: 1, amount: 80 })]}
        names={names}
        humanSeat={0}
        onClose={onClose}
      />,
    );
    expect(body.scrollTop).toBe(640);
  });
});
