import { t } from './i18n.ts';

const CHIPS = ['chip-terracotta', 'chip-teal', 'chip-honey'];

export function Pot({ collected, total }: { collected: number; total: number }) {
  return (
    <div class="pot" data-testid="pot" data-amount={total} data-collected={collected}>
      {collected > 0 && (
        <>
          <span class="chip-stack" aria-hidden="true">
            {CHIPS.map((chip) => (
              <span key={chip} class={`chip ${chip}`} />
            ))}
          </span>
          <span class="pot-amount">{t('pot.amount', { amount: collected })}</span>
        </>
      )}
      {total > collected && <span class="pot-total">{t('pot.total', { amount: total })}</span>}
    </div>
  );
}
