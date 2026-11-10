import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from '../game/index.ts';
import { HistoryMenu } from './HistoryMenu.tsx';

afterEach(cleanup);

function menu() {
  return render(
    <HistoryMenu
      seed={42}
      store={memoryStore()}
      onNewGame={vi.fn()}
      primary={<button type="button" data-testid="leave" />}
      settings={<label data-testid="sound-row" />}
    />,
  );
}

describe('HistoryMenu', () => {
  it('puts the main actions first, then Settings and History', () => {
    const { container } = menu();
    const body = container.querySelector('.menu-body');
    expect(body?.firstElementChild?.classList.contains('menu-primary')).toBe(true);
    expect(body?.querySelector('.menu-primary')?.contains(screen.getByTestId('leave'))).toBe(true);
    const titles = [...container.querySelectorAll('.menu-group-title')].map((h) => h.textContent);
    expect(titles).toEqual(['Settings', 'History']);
    const groups = container.querySelectorAll('.menu-group');
    expect(groups[0]?.contains(screen.getByTestId('sound-row'))).toBe(true);
  });

  it('lists the history actions as links, with Clear history in red', () => {
    const { container } = menu();
    for (const id of ['export-all-json', 'export-all-text', 'new-game', 'clear-history']) {
      expect(screen.getByTestId(id).classList.contains('menu-link')).toBe(true);
    }
    expect(screen.getByTestId('clear-history').classList.contains('menu-link-danger')).toBe(true);
    expect(container.querySelector('.menu-seed')?.textContent).toBe('Seed 42');
  });
});
