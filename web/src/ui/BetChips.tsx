import type { SeatIndex } from '../game/index.ts';
import { t } from './i18n.ts';

const CHIPS: Record<SeatIndex, [string, string]> = {
  0: ['chip-terracotta', 'chip-honey'],
  1: ['chip-terracotta', 'chip-teal'],
};

export function BetChips({ seat, amount }: { seat: SeatIndex; amount: number }) {
  if (amount === 0) {
    return null;
  }
  return (
    <div class="bet-chips" data-testid={`bet-${seat}`} data-amount={amount}>
      <span class="chip-stack chip-stack-small" aria-hidden="true">
        {CHIPS[seat].map((chip) => (
          <span key={chip} class={`chip ${chip}`} />
        ))}
      </span>
      <span class="bet-amount" aria-hidden="true">
        {amount}
      </span>
      <span class="visually-hidden">{t('seat.bet', { amount })}</span>
    </div>
  );
}
