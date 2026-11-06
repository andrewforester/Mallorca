import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Chat } from './Chat.tsx';
import type { ChatProps } from './Chat.tsx';
import { t } from './i18n.ts';

export function ChatSheet(props: ChatProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  useEffect(() => {
    if (open) {
      sheet.current?.querySelector<HTMLInputElement>('.chat-input')?.focus();
    }
  }, [open]);
  return (
    <>
      <button
        type="button"
        ref={button}
        class="status-button chat-open"
        data-testid="chat-open"
        aria-label={t('conversation.open')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {t('conversation.talk')}
      </button>
      {open &&
        createPortal(
          <div
            ref={sheet}
            class="chat-sheet glass"
            role="dialog"
            aria-label={t('conversation.open')}
            data-testid="chat-sheet"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                close();
              }
            }}
          >
            <button
              type="button"
              class="chat-close button button-small"
              data-testid="chat-close"
              aria-label={t('conversation.close')}
              onClick={close}
            >
              ×
            </button>
            <Chat {...props} />
          </div>,
          document.body,
        )}
    </>
  );
}
