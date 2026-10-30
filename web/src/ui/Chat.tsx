import { useEffect, useRef, useState } from 'preact/hooks';
import type { ChatLine, QuickPhrase } from '../game/index.ts';
import { t } from './i18n.ts';

export const MAX_MESSAGE = 200;
const QUICK: readonly QuickPhrase[] = ['niceHand', 'bluffing', 'notThisTime'];

export interface ChatProps {
  lines: ChatLine[];
  onSay: (text: string) => void;
  onQuick: (id: QuickPhrase, text: string) => void;
}

function Lines({ lines }: { lines: ChatLine[] }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const node = list.current;
    if (node !== null) {
      node.scrollTop = node.scrollHeight;
    }
  }, [lines.length]);
  return (
    <ol class="chat-lines" ref={list} aria-live="polite">
      {lines.map((line) => (
        <li
          key={line.id}
          class={`chat-line chat-line-${line.speaker}`}
          data-testid="chat-line"
          data-speaker={line.speaker}
        >
          <span class="chat-speaker">
            {t(line.speaker === 'mallorca' ? 'seat.bot' : 'seat.you')}
          </span>
          <span class="chat-text">{line.text}</span>
          {line.undelivered === true && (
            <span class="chat-undelivered">{t('talk.undelivered')}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function Chat({ lines, onSay, onQuick }: ChatProps) {
  const [draft, setDraft] = useState('');
  const send = (event: Event) => {
    event.preventDefault();
    const text = draft.trim();
    if (text !== '') {
      onSay(text);
    }
    setDraft('');
  };
  return (
    <div class="chat">
      <Lines lines={lines} />
      <div class="chat-quick">
        {QUICK.map((id) => (
          <button
            key={id}
            type="button"
            class="button button-small chat-chip"
            data-testid={`quick-${id}`}
            onClick={() => onQuick(id, t(`talk.quick.${id}`))}
          >
            {t(`talk.quick.${id}`)}
          </button>
        ))}
      </div>
      <form class="chat-form" onSubmit={send}>
        <input
          class="chat-input"
          type="text"
          data-testid="chat-input"
          aria-label={t('talk.message')}
          placeholder={t('talk.placeholder')}
          maxLength={MAX_MESSAGE}
          autoComplete="off"
          value={draft}
          onInput={(event) => setDraft((event.currentTarget as HTMLInputElement).value)}
        />
        <button type="submit" class="button button-small" data-testid="chat-send">
          {t('talk.send')}
        </button>
      </form>
    </div>
  );
}
