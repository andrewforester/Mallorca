import { useEffect, useRef } from 'preact/hooks';
import type { HandCategory, LogEntry, SeatIndex, StreetGroup } from '../game/index.ts';
import { groupHand } from '../game/index.ts';
import { t } from './i18n.ts';
import { handName, logKind, logLine } from './phrases.ts';
import { suitFace } from './suits.ts';

export interface HandLogDrawerProps {
  entries: LogEntry[];
  names: [string, string];
  humanSeat: SeatIndex;
  onClose: () => void;
}

function LogCard({ text }: { text: string }) {
  const { glyph, suit } = suitFace(text);
  return (
    <span class={`log-card log-card-${suit ?? 'spades'}`}>
      {text.slice(0, -1)}
      {glyph}
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
      <div class="hand-log-rows">
        {group.entries.map((entry, index) => (
          <LogRow key={index} entry={entry} names={names} humanSeat={humanSeat} />
        ))}
      </div>
    </section>
  );
}

const RESULTS = new Set(['win', 'winTournament']);

interface RowProps {
  entry: LogEntry;
  names: [string, string];
  humanSeat: SeatIndex;
}

function What({ entry, person }: { entry: LogEntry; person: 'you' | 'other' }) {
  const { category, cards } = entry.params;
  const hand = category === undefined ? '' : handName(category as HandCategory);
  return (
    <span class="log-what" aria-hidden="true">
      {typeof cards === 'string' &&
        cards.split(' ').map((card) => <LogCard key={card} text={card} />)}
      {t(`log.row.${person}.${entry.key}`, { hand })}
    </span>
  );
}

function LogRow({ entry, names, humanSeat }: RowProps) {
  const seat = entry.params.seat as SeatIndex | undefined;
  const line = logLine(entry, names, humanSeat);
  if (seat === undefined) {
    return <p class="log-row log-row-plain">{line}</p>;
  }
  const person = seat === humanSeat ? 'you' : 'other';
  if (RESULTS.has(entry.key)) {
    return <p class={`log-result log-result-${person === 'you' ? 'you' : 'her'}`}>{line}</p>;
  }
  const amount = entry.params.amount;
  const classes = [
    'log-row',
    person === 'you' ? 'log-row-you' : '',
    logKind(entry) === 'aggressive' ? 'log-row-aggressive' : '',
  ];
  return (
    <p class={classes.filter(Boolean).join(' ')}>
      <span class="log-who" aria-hidden="true">
        {names[seat]}
      </span>
      <What entry={entry} person={person} />
      <span class="log-amount" aria-hidden="true">
        {amount ?? ''}
      </span>
      <span class="log-line visually-hidden">{line}</span>
    </p>
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
    <section
      id="hand-log"
      class="hand-log-drawer"
      data-testid="hand-log"
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
    </section>
  );
}
