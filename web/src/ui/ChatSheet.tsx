import type { Ref } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Chat } from './Chat.tsx';
import type { ChatProps } from './Chat.tsx';
import { t } from './i18n.ts';

export interface TalkButtonProps {
  open: boolean;
  onToggle: () => void;
  button?: Ref<HTMLButtonElement>;
}

export function TalkButton({ open, onToggle, button }: TalkButtonProps) {
  return (
    <button
      type="button"
      ref={button}
      class="status-button chat-open"
      data-testid="chat-open"
      aria-label={t('conversation.open')}
      aria-expanded={open}
      onClick={onToggle}
    >
      {t('conversation.talk')}
    </button>
  );
}

export interface TalkLayerProps extends ChatProps {
  onClose: () => void;
}

export function TalkLayer({ onClose, ...chat }: TalkLayerProps) {
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    section.current?.querySelector<HTMLInputElement>('.chat-input')?.focus();
  }, []);
  return (
    <section
      ref={section}
      class="chat-sheet"
      aria-label={t('conversation.open')}
      data-testid="chat-sheet"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose();
        }
      }}
    >
      <div class="chat-sheet-head">
        <button
          type="button"
          class="chat-close"
          data-testid="chat-close"
          aria-label={t('conversation.close')}
          onClick={onClose}
        >
          {t('coach.hide')}
        </button>
      </div>
      <Chat {...chat} />
    </section>
  );
}
