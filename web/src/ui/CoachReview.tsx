import { leaks, MIN_SPOTS } from '../game/index.ts';
import type { CoachDecision } from '../game/index.ts';
import { moveText } from './coachPhrases.ts';
import { t } from './i18n.ts';

const SHOWN = 3;
const SHOWN_SHARE = 0.005;

function played(decision: CoachDecision): string {
  const move = decision.chosen === null ? undefined : decision.moves[decision.chosen];
  if (move !== undefined) return moveText(move);
  const { action } = decision;
  return t(`coach.action.${action.kind}`, { amount: action.kind === 'raise' ? action.to : 0 });
}

function Row({ decision }: { decision: CoachDecision }) {
  const top = decision.moves
    .map((move, k) => ({ move, share: decision.mine[k] ?? 0 }))
    .sort((a, b) => b.share - a.share)
    .slice(0, SHOWN)
    .filter(({ share }) => share >= SHOWN_SHARE);
  return (
    <li class={`coach-review-row coach-grade-${decision.grade ?? 'none'}`}>
      <span class="coach-review-street">{t(`log.street.${decision.street}`)}</span>
      <span class="coach-review-move">{played(decision)}</span>
      <span class="coach-review-grade">{t(`coach.grade.${decision.grade ?? 'none'}`)}</span>
      <span class="coach-review-shares">
        {top.map(({ move, share }) => (
          <span key={`${move.label}-${move.amount}`}>
            {t('coach.share', { move: moveText(move), percent: Math.round(share * 100) })}
          </span>
        ))}
      </span>
    </li>
  );
}

export function HandReview({ review }: { review: CoachDecision[] }) {
  return (
    <section class="coach-review" data-testid="coach-review">
      <h3 class="coach-heading">{t('coach.reviewHeading')}</h3>
      <ol class="coach-review-list">
        {review.map((decision, index) => (
          <Row key={index} decision={decision} />
        ))}
      </ol>
    </section>
  );
}

export function LeaksView({ log }: { log: CoachDecision[] }) {
  const shown = leaks(log).filter((leak) => leak.spots >= MIN_SPOTS);
  return (
    <section class="coach-leaks" data-testid="coach-leaks">
      <h3 class="coach-heading">{t('coach.leaksHeading')}</h3>
      {shown.length === 0 ? (
        <p class="coach-note">{t('coach.noLeaks', { count: MIN_SPOTS })}</p>
      ) : (
        <ul class="coach-leak-list">
          {shown.map((leak) => (
            <li key={leak.spot} class="coach-leak">
              <span class="coach-leak-name">{t(`coach.leak.${leak.spot}`)}</span>
              <span class="coach-note">
                {t('coach.leakLine', {
                  player: Math.round(leak.player * 100),
                  strategy: Math.round(leak.strategy * 100),
                  spots: leak.spots,
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
