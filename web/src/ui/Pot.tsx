import { t } from './i18n.ts';

const CHIPS = ['chip-terracotta', 'chip-teal', 'chip-honey'];

export function Pot({ collected, total }: { collected: number; total: number }) {
  return (
    <div class="pot" data-testid="pot" data-amount={total} data-collected={collected}>
      <span class="chip-stack" aria-hidden="true">
        {CHIPS.map((chip) => (
          <span key={chip} class={`chip ${chip}`} />
        ))}
      </span>
      {t('pot.amount', { amount: total })}
    </div>
  );
}
