import { describe, expect, it } from 'vitest';
import { nextHandDelay } from './autoNext.ts';
import { fixtureResult } from './fixtures.ts';

describe('nextHandDelay', () => {
  it('waits one second after a hand won without a showdown', () => {
    const vm = fixtureResult();
    vm.result = { winner: 1, category: null, amount: 30, cards: [] };
    expect(nextHandDelay(vm)).toBe(1000);
  });

  it('waits two seconds after a showdown so both hands can be read', () => {
    expect(nextHandDelay(fixtureResult())).toBe(2000);
  });

  it('waits two seconds after a split pot', () => {
    const vm = fixtureResult();
    vm.result = { winner: null, category: 'pair', amount: 60, cards: [] };
    expect(nextHandDelay(vm)).toBe(2000);
  });

  it('never moves on once the tournament has a winner', () => {
    const vm = fixtureResult();
    vm.tournamentWinner = 1;
    expect(nextHandDelay(vm)).toBeNull();
  });

  it('moves on in a cash game too, with the same waits', () => {
    const vm = fixtureResult();
    vm.mode = 'cash';
    expect(nextHandDelay(vm)).toBe(2000);
    vm.result = { winner: 1, category: null, amount: 30, cards: [] };
    expect(nextHandDelay(vm)).toBe(1000);
  });

  it('has nothing to wait for while a hand is in progress', () => {
    const vm = fixtureResult();
    vm.result = null;
    expect(nextHandDelay(vm)).toBeNull();
  });
});
