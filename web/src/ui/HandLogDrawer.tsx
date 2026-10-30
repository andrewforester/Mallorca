import { useEffect, useRef } from 'preact/hooks';
import type { LogEntry, SeatIndex } from '../game/index.ts';
import { groupHand } from './handLog.ts';
import type { StreetGroup } from './handLog.ts';
import { t } from './i18n.ts';
import { logKind, logLine } from './phrases.ts';

export interface HandLogDrawerProps {
  entries: LogEntry[];
  names: [string, string];
  humanSeat: SeatIndex;
  onClose: () => void;
}

const SUIT_SYMBOLS: Record<string, string> = { c: '♣', d: '♦', h: '♥', s: '♠' };

function LogCard({ text }: { text: string }) {
  const suit = text.slice(-1);
  const red = suit === 'h' || suit === 'd';
  return (
    <span class={`log-card${red ? ' log-card-red' : ''}`}>
      {text.slice(0, -1)}
      {SUIT_SYMBOLS[suit] ?? suit}
    </span>
  );
}

interface StreetProps {
  group: StreetGroup;
  names: [string, string];
  humanSeat: SeatIndex;
}

function Street({ group, names, humanSeat }: StreetProps) {
  return (
    <section class="hand-log-street">
      <header class="hand-log-street-head">
        <h3 class="hand-log-street-name">{t(`log.street.${group.street}`)}</h3>
        {group.cards.map((card) => (
          <LogCard key={card} text={card} />
        ))}
        {group.street === 'preflop' ? null : (
          <span class="hand-log-pot">{t('pot.amount', { amount: group.pot })}</span>
        )}
      </header>
      <div class="hand-log-tokens">
        {group.entries.map((entry, index) => (
          <span
            key={index}
            class={`log-token${logKind(entry) === 'aggressive' ? ' log-token-aggressive' : ''}`}
          >
            {logLine(entry, names, humanSeat)}
          </span>
        ))}
      </div>
    </section>
  );
}

function handNumber(entries: LogEntry[]): number | string {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index] as LogEntry;
    if (entry.key === 'handStarted') {
      return entry.params.number ?? '';
    }
  }
  return '';
}

export function HandLogDrawer({ entries, names, humanSeat, onClose }: HandLogDrawerProps) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => closeButton.current?.focus(), []);
  useEffect(() => {
    const node = body.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [entries.length]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [onClose]);
  return (
    <>
      <div class="hand-log-scrim" data-testid="hand-log-scrim" onClick={onClose} />
      <div
        id="hand-log"
        class="hand-log-drawer"
        data-testid="hand-log"
        role="dialog"
        aria-label={t('log.title')}
      >
        <header class="hand-log-head">
          <h2 class="hand-log-heading">{t('log.hand', { number: handNumber(entries) })}</h2>
          <button
            type="button"
            class="hand-log-close"
            ref={closeButton}
            data-testid="hand-log-close"
            aria-label={t('log.close')}
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </header>
        <div class="hand-log-body" ref={body}>
          {groupHand(entries).map((group) => (
            <Street key={group.street} group={group} names={names} humanSeat={humanSeat} />
          ))}
        </div>
      </div>
    </>
  );
}
