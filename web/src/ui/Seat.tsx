import type { SeatView } from '../game/index.ts';
import { ActionBubble } from './ActionBubble.tsx';
import { Card } from './Card.tsx';

export interface SeatProps {
  index: 0 | 1;
  view: SeatView;
  thinking: boolean;
  winner: boolean;
  position: 'top' | 'bottom';
}

export function Seat({ index, view, thinking, winner, position }: SeatProps) {
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
        <div class="seat-bubble">
          <ActionBubble seat={index} entry={view.lastAction} thinking={thinking} />
        </div>
        <header class="seat-info glass pill">
          <span class="seat-name">{view.name}</span>
          <span class="seat-stack" data-testid={`stack-${index}`} data-stack={view.stack}>
            {view.stack}
          </span>
        </header>
      </div>
      <div class="seat-cards">
        {view.cards.map((card, slot) => (
          <Card key={slot} card={card} highlight={winner && card !== 'back'} />
        ))}
      </div>
    </section>
  );
}
