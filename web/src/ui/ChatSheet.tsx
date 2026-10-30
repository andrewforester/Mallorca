import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Chat } from './Chat.tsx';
import type { ChatProps } from './Chat.tsx';
import { t } from './i18n.ts';

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M4 5.5C4 4.7 4.7 4 5.5 4h13c.8 0 1.5.7 1.5 1.5v9c0 .8-.7 1.5-1.5 1.5H10l-4.5 4v-4h0c-.8 0-1.5-.7-1.5-1.5z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
    </svg>
  );
}

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
        class="chat-open glass"
        data-testid="chat-open"
        aria-label={t('talk.open')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChatIcon />
      </button>
      {open &&
        createPortal(
          <div
            ref={sheet}
            class="chat-sheet glass"
            role="dialog"
            aria-label={t('talk.open')}
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
              aria-label={t('talk.close')}
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
