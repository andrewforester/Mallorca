import type { Card as CardValue } from '../game/index.ts';
import { Card } from './Card.tsx';
import { t } from './i18n.ts';

const SLOTS = 5;

export function Board({ cards }: { cards: CardValue[] }) {
  const empty = Array.from({ length: Math.max(0, SLOTS - cards.length) }, (_, slot) => slot);
  return (
    <div class="board" data-testid="board" role="group" aria-label={t('board.label')}>
      {cards.map((card) => (
        <Card key={card} card={card} />
      ))}
      {empty.map((slot) => (
        <span key={`slot-${slot}`} class="board-slot" aria-hidden="true" />
      ))}
    </div>
  );
}
