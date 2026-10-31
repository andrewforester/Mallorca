import type { ComponentChildren } from 'preact';
import type { LogEntry, SeatView } from '../game/index.ts';
import { ActionBubble } from './ActionBubble.tsx';
import { Card } from './Card.tsx';

export interface SeatProps {
  index: 0 | 1;
  view: SeatView;
  action: LogEntry | null;
  thinking: boolean;
  winner: boolean;
  position: 'top' | 'bottom';
  portrait?: ComponentChildren;
  children?: ComponentChildren;
}

export function Seat(props: SeatProps) {
  const { index, view, action, thinking, winner, position, portrait, children } = props;
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
      {portrait}
      <div class="seat-plaque">
        <div class="seat-bubble">
          <ActionBubble seat={index} entry={action} thinking={thinking} />
        </div>
        <header class="seat-info glass pill">
          <span class="seat-name">{view.name}</span>
          <span class="seat-stack" data-testid={`stack-${index}`} data-stack={view.stack}>
            {view.stack}
          </span>
        </header>
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
