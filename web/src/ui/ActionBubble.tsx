import type { LogEntry, SeatIndex } from '../game/index.ts';
import { t } from './i18n.ts';
import { actionKind, actionTag } from './phrases.ts';

export interface ActionBubbleProps {
  seat: SeatIndex;
  entry: LogEntry | null;
  thinking: boolean;
}

export function ActionBubble({ seat, entry, thinking }: ActionBubbleProps) {
  if (thinking) {
    return (
      <span class="bubble bubble-thinking" data-testid={`thinking-${seat}`}>
        {t('seat.thinking')}
      </span>
    );
  }
  if (entry === null) {
    return null;
  }
  return (
    <span class={`bubble bubble-${actionKind(entry)}`} data-testid={`action-${seat}`}>
      {actionTag(entry)}
    </span>
  );
}
