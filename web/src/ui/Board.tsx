import type { Card as CardValue } from '../game/index.ts';
import { Card, playedOut } from './Card.tsx';
import { t } from './i18n.ts';

const SLOTS = 5;

export function Board({
  cards,
  played = null,
}: {
  cards: CardValue[];
  played?: readonly CardValue[] | null;
}) {
  const empty = Array.from({ length: Math.max(0, SLOTS - cards.length) }, (_, slot) => slot);
  return (
    <div class="board" data-testid="board" role="group" aria-label={t('board.label')}>
      {cards.map((card) => (
        <Card key={card} card={card} dim={playedOut(card, played)} />
      ))}
      {empty.map((slot) => (
        <span key={`slot-${slot}`} class="board-slot" aria-hidden="true" />
      ))}
    </div>
  );
}
