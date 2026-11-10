import { createTable } from '../engine/index.ts';
import type { Table, TableMode } from '../engine/index.ts';
import type { SessionOptions } from './sessionTypes.ts';

export function freshTable(options: SessionOptions, mode: TableMode): Table {
  const { names, startingStacks } = options;
  const table = createTable(names, mode, 0);
  if (startingStacks === undefined) {
    return table;
  }
  return {
    ...table,
    seats: [
      { name: names[0], stack: startingStacks[0] },
      { name: names[1], stack: startingStacks[1] },
    ],
  };
}
