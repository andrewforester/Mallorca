import { useId } from 'preact/hooks';
import { formatCard, rankOf } from '../game/index.ts';
import type { Card as CardValue } from '../game/index.ts';
import { t } from './i18n.ts';
import { suitFace } from './suits.ts';

const RANKS: Record<number, string> = { 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export interface CardProps {
  card: CardValue | 'back';
  highlight?: boolean;
}

function CardBack({ className }: { className: string }) {
  const id = useId();
  return (
    <svg
      class={`${className} card-back`}
      viewBox="0 0 250 350"
      role="img"
      aria-label={t('card.back')}
      data-testid="card-back"
    >
      <defs>
        <pattern
          id={`weave-${id}`}
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect class="card-weave-ground" width="14" height="14" />
          <path class="card-weave-line" d="M0 7h14M7 0v14" />
        </pattern>
      </defs>
      <rect class="card-body" x="2" y="2" width="246" height="346" rx="18" />
      <rect
        class="card-weave"
        x="16"
        y="16"
        width="218"
        height="318"
        rx="10"
        fill={`url(#weave-${id})`}
      />
    </svg>
  );
}

function CardFace({ card, className }: { card: CardValue; className: string }) {
  const id = useId();
  const rank = RANKS[rankOf(card)] ?? String(rankOf(card));
  const { glyph, suit } = suitFace(card);
  return (
    <svg
      class={`${className} card-${suit ?? 'spades'}`}
      viewBox="0 0 250 350"
      role="img"
      aria-label={formatCard(card)}
      data-testid="card"
      data-card={formatCard(card)}
    >
      <defs>
        <linearGradient id={`paper-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop class="card-paper-light" offset="0" />
          <stop class="card-paper-shade" offset="1" />
        </linearGradient>
      </defs>
      <rect
        class="card-body"
        x="2"
        y="2"
        width="246"
        height="346"
        rx="18"
        fill={`url(#paper-${id})`}
      />
      <text class="card-rank" x="125" y="168" text-anchor="middle">
        {rank}
      </text>
      <text class="card-suit" x="125" y="282" text-anchor="middle">
        {glyph}
      </text>
    </svg>
  );
}

export function Card({ card, highlight = false }: CardProps) {
  const className = `card${highlight ? ' card-highlight' : ''}`;
  return card === 'back' ? (
    <CardBack className={className} />
  ) : (
    <CardFace card={card} className={className} />
  );
}
