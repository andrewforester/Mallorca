import type { TableEvent } from '../../game/index.ts';
import { COPY } from './copy.ts';
import { bb, pct } from './format.ts';

const E = COPY.event;

function describeOwn(e: Extract<TableEvent, { kind: 'ownMove' }>): string {
  const bet = e.move === 'bet';
  const size = bet ? e.amountBb : e.facingBb;
  return `${bet ? E.herBet : E.herFold} ${size.toFixed(1)} bb, ${E.equity} ${pct(e.equity)}`;
}

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
    case 'ownMove':
      return describeOwn(e);
    case 'chat':
      return `${E.chat} ${e.signal}`;
  }
}
