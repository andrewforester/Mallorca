import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ViewModel } from '../game/index.ts';
import { fixtureResult } from './fixtures.ts';
import { Table } from './Table.tsx';

afterEach(cleanup);

function table(vm: ViewModel) {
  return render(
    <Table vm={vm} phase="handOver" humanSeat={0} onAct={vi.fn()} onNextHand={vi.fn()} />,
  );
}

function showdown(): ViewModel {
  const vm = fixtureResult();
  vm.seats[0].cards = [0, 1];
  vm.result = { winner: 1, category: 'two-pair', amount: 120, cards: [44, 48, 41, 25, 10] };
  return vm;
}

function dimmed(): string[] {
  return [...document.querySelectorAll('[data-testid="card"].card-dim')].map(
    (node) => node.getAttribute('data-card') ?? '',
  );
}

describe('the result pill', () => {
  it('takes the place of the pot with the amount and the hand', () => {
    table(showdown());
    const pill = screen.getByTestId('result');
    expect(pill.closest('.pot-block')).not.toBeNull();
    expect(pill.querySelector('.result-amount')?.textContent).toBe('+120');
    expect(pill.querySelector('.result-detail')?.textContent).toBe('Two pair');
    expect(pill.textContent).toContain('Mallorca wins 120 with Two pair');
    expect(screen.queryByTestId('pot')).toBeNull();
    expect(document.querySelector('.result-text')).toBeNull();
  });

  it('is green for you and dark for her', () => {
    const vm = showdown();
    table(vm);
    expect(screen.getByTestId('result').classList.contains('result-pill-her')).toBe(true);
    cleanup();
    vm.result = { winner: 0, category: 'two-pair', amount: 120, cards: [] };
    table(vm);
    expect(screen.getByTestId('result').classList.contains('result-pill-you')).toBe(true);
  });

  it('names the winner when no cards were shown', () => {
    const vm = showdown();
    vm.result = { winner: 1, category: null, amount: 20, cards: [] };
    table(vm);
    expect(screen.getByTestId('result').querySelector('.result-detail')?.textContent).toBe(
      'Mallorca',
    );
  });

  it('gives each share of a split and the hand', () => {
    const vm = showdown();
    vm.result = { winner: null, category: 'full-house', amount: 60, cards: [] };
    table(vm);
    const pill = screen.getByTestId('result');
    expect(pill.classList.contains('result-pill-split')).toBe(true);
    expect(pill.querySelector('.result-amount')?.textContent).toBe('60 each');
    expect(pill.querySelector('.result-detail')?.textContent).toBe('Split · Full house');
  });
});

describe('the showdown', () => {
  it('dims every card outside the winning five', () => {
    table(showdown());
    expect(dimmed().sort()).toEqual(['2c', '2d', '3d', 'Qc']);
  });

  it('dims nothing when no cards were shown', () => {
    const vm = showdown();
    vm.result = { winner: 1, category: null, amount: 20, cards: [] };
    table(vm);
    expect(dimmed()).toEqual([]);
  });

  it('outlines the winner block', () => {
    table(showdown());
    expect(screen.getByTestId('seat-1').classList.contains('seat-winner')).toBe(true);
    expect(screen.getByTestId('seat-0').classList.contains('seat-winner')).toBe(false);
  });
});
