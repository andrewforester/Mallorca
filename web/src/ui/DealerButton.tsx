import { t } from './i18n.ts';

export function DealerButton() {
  return (
    <span
      class="dealer-button"
      role="img"
      aria-label={t('seat.dealerLabel')}
      data-testid="dealer-button"
    >
      {t('seat.dealer')}
    </span>
  );
}
