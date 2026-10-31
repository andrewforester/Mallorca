import { formatCard, HAND_CLASSES } from '../game/index.ts';
import type { Composition, Outs } from '../game/index.ts';
import { t } from './i18n.ts';

function whole(share: number): number {
  return Math.round(share * 100);
}

export function CompositionView({ composition }: { composition: Composition }) {
  return (
    <div class="coach-composition" data-testid="coach-composition">
      {HAND_CLASSES.map((name) => (
        <div key={name} class="coach-class">
          <span class="coach-class-name">{t(`coach.classes.${name}`)}</span>
          <span
            class="coach-class-bar"
            style={{ '--share': composition.shares[name].toFixed(3) }}
          />
          <span class="coach-class-value">
            {t('coach.percent', { value: whole(composition.shares[name]) })}
          </span>
        </div>
      ))}
      <p class="coach-note">{t('coach.ahead', { percent: whole(composition.ahead) })}</p>
    </div>
  );
}

export function OutsView({ outs }: { outs: Outs }) {
  const count = outs.cards.length;
  return (
    <div class="coach-outs" data-testid="coach-outs">
      {count === 0 ? (
        <p class="coach-note">{t('coach.noOuts')}</p>
      ) : (
        <>
          <p class="coach-outs-cards">
            {t('coach.outs', { count, cards: outs.cards.map(formatCard).join(' ') })}
          </p>
          <p class="coach-note coach-chances">
            <span>{t('coach.nextCard', { percent: whole(outs.nextCard) })}</span>
            {outs.byRiver !== null && (
              <span>{t('coach.byRiver', { percent: whole(outs.byRiver) })}</span>
            )}
          </p>
        </>
      )}
    </div>
  );
}

export function BlockersView({ share }: { share: number }) {
  return (
    <p class="coach-note" data-testid="coach-blockers">
      {t('coach.blockers', { percent: whole(share) })}
    </p>
  );
}
