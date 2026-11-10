import { t } from './i18n.ts';

function Part({ kind, word, amount }: { kind: string; word: string; amount: number }) {
  return (
    <span class={kind}>
      <span class="pot-word">{word}</span> <span class="pot-number">{amount}</span>
    </span>
  );
}

export function Pot({ collected, total }: { collected: number; total: number }) {
  return (
    <div class="pot" data-testid="pot" data-amount={total} data-collected={collected}>
      {collected > 0 && <Part kind="pot-amount" word={t('pot.label')} amount={collected} />}
      {total > collected && <Part kind="pot-total" word={t('pot.totalLabel')} amount={total} />}
    </div>
  );
}
