import type { BettingStreet } from './types.ts';

export const BOARD_SIZE = { preflop: 0, flop: 3, turn: 4, river: 5 } as const satisfies Record<
  BettingStreet,
  number
>;

export type BoardSize = typeof BOARD_SIZE;
