import type { ViewModel } from '../game/index.ts';

export function viewModel(overrides: Partial<ViewModel['controls']> = {}): ViewModel {
  return {
    seats: [
      {
        name: 'You',
        stack: 1960,
        bet: 40,
        isButton: true,
        isToAct: true,
        cards: [48, 41],
        lastAction: null,
      },
      {
        name: 'Mallorca',
        stack: 1900,
        bet: 100,
        isButton: false,
        isToAct: false,
        cards: ['back', 'back'],
        lastAction: { key: 'raiseTo', params: { amount: 100 } },
      },
    ],
    board: [],
    pot: { collected: 0, total: 140 },
    controls: {
      fold: true,
      passive: { kind: 'call', amount: 60 },
      raise: {
        kind: 'raise',
        min: 160,
        max: 2000,
        presets: { halfPot: 250, pot: 400, allIn: 2000 },
      },
      enabled: true,
      ...overrides,
    },
    mode: 'tournament',
    session: { hands: 0, netBb: 0, bbPer100: null },
    blinds: { small: 10, big: 20 },
    handNumber: 1,
    result: null,
    tournamentWinner: null,
  };
}

export function fixtureResult(): ViewModel {
  const vm = viewModel({
    enabled: false,
    fold: false,
    raise: null,
    passive: { kind: 'check', amount: 0 },
  });
  vm.board = [48, 41, 25, 10, 5];
  vm.pot = { collected: 0, total: 0 };
  vm.seats[1].cards = [44, 40];
  vm.seats[0].isToAct = false;
  vm.result = { winner: 1, category: 'two-pair', amount: 120 };
  return vm;
}
