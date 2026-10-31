import { useEffect, useRef } from 'preact/hooks';
import type { CoachState } from '../game/index.ts';
import { Coach } from './Coach.tsx';
import { t } from './i18n.ts';

export interface CoachSheetProps {
  state: CoachState;
  onClose: () => void;
}

export function CoachSheet({ state, onClose }: CoachSheetProps) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [onClose]);
  return (
    <>
      <div class="coach-scrim" data-testid="coach-scrim" onClick={onClose} />
      <div class="coach-sheet" id="coach-sheet" role="dialog" aria-label={t('coach.label')}>
        <div class="coach-sheet-head">
          <h2 class="coach-sheet-heading">{t('coach.label')}</h2>
          <button
            type="button"
            class="hand-log-close"
            data-testid="coach-close"
            aria-label={t('coach.close')}
            ref={close}
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
        </div>
        <Coach state={state} />
      </div>
    </>
  );
}
