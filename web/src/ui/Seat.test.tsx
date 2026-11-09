import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { LogEntry, SeatView } from '../game/index.ts';
import { viewModel } from './fixtures.ts';
import { Seat } from './Seat.tsx';
import type { SeatProps } from './Seat.tsx';

afterEach(cleanup);

function seat(overrides: Partial<SeatProps> = {}, view: Partial<SeatView> = {}) {
  const base = viewModel().seats[1];
  return render(
    <Seat
      index={1}
      view={{ ...base, ...view }}
      action={null}
      thinking={false}
      winner={false}
      position="top"
      bet={{ amount: 60, sweeping: false }}
      {...overrides}
    />,
  );
}

const bet: LogEntry = { key: 'bet', params: { amount: 60 } };

describe('Seat block', () => {
  it('keeps a dealer slot when the seat is not on the button', () => {
    const { container } = seat({}, { isButton: false });
    expect(container.querySelector('.seat-side .dealer-slot')).not.toBeNull();
    expect(screen.queryByTestId('dealer-button')).toBeNull();
  });

  it('puts the dealer button in the slot when on the button', () => {
    const { container } = seat({}, { isButton: true });
    expect(container.querySelector('.dealer-slot [data-testid="dealer-button"]')).not.toBeNull();
  });

  it('puts the bet after the dealer slot', () => {
    const { container } = seat();
    const side = [...(container.querySelector('.seat-side')?.children ?? [])];
    expect(side.map((node) => node.getAttribute('data-testid') ?? node.className)).toEqual([
      'dealer-slot',
      'bet-1',
    ]);
  });

  it('shows the stack under the name', () => {
    const { container } = seat();
    const block = [...(container.querySelector('.seat-block')?.children ?? [])];
    expect(block.map((node) => node.className)).toEqual(['seat-name', 'seat-stack']);
    expect(screen.getByTestId('stack-1').textContent).toBe('1900');
  });

  it('shows the last action as the strip of the block', () => {
    const { container } = seat({ action: bet });
    const strip = container.querySelector('.seat-block [data-testid="action-1"]');
    expect(strip?.classList.contains('seat-strip')).toBe(true);
    expect(strip?.textContent).toBe('Bet 60');
  });

  it('shows no strip without an action', () => {
    const { container } = seat();
    expect(container.querySelector('.seat-strip')).toBeNull();
  });

  it('shows thinking in the strip', () => {
    const { container } = seat({ thinking: true });
    expect(container.querySelector('.seat-block [data-testid="thinking-1"]')).not.toBeNull();
  });

  it('keeps long stacks inside the block', () => {
    seat({}, { stack: 123456 });
    expect(screen.getByTestId('stack-1').closest('.seat-block')).not.toBeNull();
  });

  it('puts the cards above the block for both seats', () => {
    const { container } = seat({ position: 'bottom', index: 0 }, { cards: [48, 41] });
    const children = [...(container.querySelector('.seat')?.children ?? [])];
    expect(children.map((node) => node.className)).toEqual([
      'seat-cards',
      'seat-block',
      'seat-side',
    ]);
  });
});
