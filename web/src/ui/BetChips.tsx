import type { SeatIndex } from '../game/index.ts';
import { t } from './i18n.ts';

interface BetChipsProps {
  seat: SeatIndex;
  amount: number;
  sweeping?: boolean;
}

export function BetChips({ seat, amount, sweeping = false }: BetChipsProps) {
  if (amount === 0) {
    return null;
  }
  return (
    <div
      class={sweeping ? 'bet-chips bet-sweep' : 'bet-chips'}
      data-testid={`bet-${seat}`}
      data-amount={amount}
    >
      <span class="chip-dot" aria-hidden="true" />
      <span class="bet-amount" aria-hidden="true">
        {amount}
      </span>
      <span class="visually-hidden">{t('seat.bet', { amount })}</span>
    </div>
  );
}
