import type { TableEvent } from '../../game/index.ts';
import { COPY } from './copy.ts';
import { bb, pct } from './format.ts';

const E = COPY.event;

export function describeEvent(e: TableEvent): string {
  switch (e.kind) {
    case 'deal':
      return `${E.deal}, ${E.equity} ${pct(e.equity)}, ${E.pot} ${e.potBb.toFixed(1)} bb`;
    case 'street':
      return `${E.street}, ${E.equity} ${pct(e.equity)}, ${E.pot} ${e.potBb.toFixed(1)} bb`;
    case 'opponentBet':
      return `${e.raise === true ? E.opponentRaise : E.opponentBet} ${e.sizeBb.toFixed(1)} bb`;
    case 'result':
      return `${E.result}, ${bb(e.netBb)}`;
    case 'bluff':
      return `${e.succeeded ? E.bluffThrough : E.bluffCaught}, ${E.pot} ${e.potBb.toFixed(1)} bb`;
    case 'mistake':
      return `${E.mistake}, ${bb(-e.costBb)}`;
    case 'chat':
      return `${E.chat} ${e.signal}`;
  }
}
