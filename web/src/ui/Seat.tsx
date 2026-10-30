import type { ComponentChildren } from 'preact';
import type { SeatView } from '../game/index.ts';
import { Card } from './Card.tsx';
import { t } from './i18n.ts';
import { actionTag } from './phrases.ts';

export interface SeatProps {
  index: 0 | 1;
  view: SeatView;
  thinking: boolean;
  winner: boolean;
  position: 'top' | 'bottom';
  children?: ComponentChildren;
}

export function Seat({ index, view, thinking, winner, position, children }: SeatProps) {
  const className = [
    'seat',
    `seat-${position}`,
    view.isToAct ? 'seat-active' : '',
    winner ? 'seat-winner' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section class={className} data-testid={`seat-${index}`} data-winner={winner}>
      <div class="seat-plaque">
        <header class="seat-info glass pill">
          {view.isButton && (
            <span class="dealer-button" role="img" aria-label={t('seat.dealerLabel')}>
              {t('seat.dealer')}
            </span>
          )}
          <span class="seat-name">{view.name}</span>
          <span class="seat-stack" data-testid={`stack-${index}`} data-stack={view.stack}>
            {view.stack}
          </span>
        </header>
        <div class="seat-tags">
          {thinking && (
            <span class="tag tag-thinking glass pill" data-testid={`thinking-${index}`}>
              {t('seat.thinking')}
            </span>
          )}
          {!thinking && view.lastAction !== null && (
            <span class="tag tag-action glass pill" data-testid={`action-${index}`}>
              {actionTag(view.lastAction)}
            </span>
          )}
          {view.bet > 0 && (
            <span class="tag tag-bet glass pill" data-testid={`bet-${index}`}>
              {t('seat.bet', { amount: view.bet })}
            </span>
          )}
        </div>
        {children}
      </div>
      <div class="seat-cards">
        {view.cards.map((card, slot) => (
          <Card key={slot} card={card} highlight={winner && card !== 'back'} />
        ))}
      </div>
    </section>
  );
}
