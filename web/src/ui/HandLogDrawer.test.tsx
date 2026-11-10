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
  it('is a labelled section titled with the hand number', () => {
    setup();
    const drawer = screen.getByTestId('hand-log');
    expect(drawer.tagName).toBe('SECTION');
    expect(drawer.getAttribute('aria-label')).toBe('Hand log');
    expect(screen.getByRole('heading', { name: 'Hand 2' })).toBeTruthy();
  });

  it('lists the street headings in order', () => {
    setup();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent);
    expect(headings).toEqual(['Preflop', 'Flop']);
  });

  it('shows the flop as three card chips and hides the preflop pot', () => {
    setup();
    const preflop = screen.getByRole('heading', { name: 'Preflop' }).closest('section');
    const flop = screen.getByRole('heading', { name: 'Flop' }).closest('section');
    expect(preflop?.querySelectorAll('.log-card').length).toBe(0);
    expect(preflop?.textContent).not.toContain('Pot');
    const chips = flop?.querySelectorAll('.log-card') ?? [];
    expect(chips.length).toBe(3);
    expect(chips[0]?.textContent).toBe('A♠');
    expect(chips[0]?.classList.contains('log-card-spades')).toBe(true);
    expect(chips[2]?.classList.contains('log-card-spades')).toBe(false);
    expect(flop?.textContent).toContain('Pot 120');
  });

  it('writes one row per action with who, what and how much, and marks aggression', () => {
    setup();
    const rows = [...document.querySelectorAll('.log-row')];
    const raise = rows.find(
      (row) => row.querySelector('.log-line')?.textContent === 'You raise to 60',
    );
    expect(raise?.querySelector('.log-who')?.textContent).toBe('You');
    expect(raise?.querySelector('.log-what')?.textContent).toBe('raise to');
    expect(raise?.querySelector('.log-amount')?.textContent).toBe('60');
    expect(raise?.classList.contains('log-row-you')).toBe(true);
    expect(raise?.classList.contains('log-row-aggressive')).toBe(true);
    const call = rows.find(
      (row) => row.querySelector('.log-line')?.textContent === 'Mallorca calls 40',
    );
    expect(call?.querySelector('.log-who')?.textContent).toBe('Mallorca');
    expect(call?.querySelector('.log-what')?.textContent).toBe('calls');
    expect(call?.classList.contains('log-row-you')).toBe(false);
    expect(call?.classList.contains('log-row-aggressive')).toBe(false);
  });

  it('shows the cards and the hand at a showdown and closes with the result', () => {
    setup(vi.fn(), [
      ...HAND,
      e('show', { seat: 1, cards: 'Qd 5h', category: 'two-pair' }),
      e('win', { seat: 0, amount: 120 }),
    ]);
    const show = [...document.querySelectorAll('.log-row')].at(-1);
    expect(
      [...(show?.querySelectorAll('.log-card') ?? [])].map((card) => card.textContent),
    ).toEqual(['Q♦', '5♥']);
    expect(show?.querySelector('.log-what')?.textContent).toContain('Two pair');
    const result = document.querySelector('.log-result');
    expect(result?.textContent).toBe('You win 120');
    expect(result?.classList.contains('log-result-you')).toBe(true);
  });

  it('uses no monospace for the pot', () => {
    setup();
    expect(document.querySelector('.hand-log-pot')?.textContent).toBe('Pot 120');
  });

  it('shows only the current hand', () => {
    setup();
    expect(screen.queryByText('Hand 1')).toBeNull();
    expect(document.querySelectorAll('.log-row').length).toBe(6);
  });

  it('is a named region with no scrim, so the table stays in play', () => {
    setup();
    const log = screen.getByRole('region', { name: 'Hand log' });
    expect(log.getAttribute('data-testid')).toBe('hand-log');
    expect(screen.queryByTestId('hand-log-scrim')).toBeNull();
  });

  it('closes on Escape and the close button', () => {
    const onClose = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    const close = screen.getByTestId('hand-log-close');
    expect(close.getAttribute('aria-label')).toBe('Close hand log');
    expect(close.textContent).toBe('');
    expect(close.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(2);
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
