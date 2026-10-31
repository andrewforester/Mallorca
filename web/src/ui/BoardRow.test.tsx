import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Board } from './Board.tsx';
import { BoardRow } from './BoardRow.tsx';

afterEach(cleanup);

describe('Board', () => {
  it('fills the five slots with the cards and then empty placeholders', () => {
    render(<Board cards={[48, 41]} />);
    const board = screen.getByTestId('board');
    expect(within(board).getAllByTestId('card').length).toBe(2);
    const slots = board.querySelectorAll('.board-slot');
    expect(slots.length).toBe(3);
    for (const slot of slots) {
      expect(slot.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

describe('BoardRow', () => {
  it('puts the pot before the board on one row', () => {
    const { container } = render(<BoardRow pot={{ collected: 120, total: 200 }} board={[48]} />);
    const row = container.querySelector('.board-row');
    const pot = screen.getByTestId('pot');
    const board = screen.getByTestId('board');
    expect(row?.contains(pot)).toBe(true);
    expect(row?.contains(board)).toBe(true);
    expect(pot.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the board in place when the pot is hidden', () => {
    const { container } = render(<BoardRow pot={null} board={[]} />);
    expect(screen.queryByTestId('pot')).toBeNull();
    expect(container.querySelector('.board-row .pot-block')).not.toBeNull();
    expect(screen.getByTestId('board').querySelectorAll('.board-slot').length).toBe(5);
  });
});
