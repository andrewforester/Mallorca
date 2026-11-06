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
    <section class="coach-sheet" id="coach-sheet" aria-label={t('coach.label')}>
      <div class="coach-sheet-head">
        <h2 class="coach-sheet-heading">{t('coach.label')}</h2>
        <button
          type="button"
          class="coach-hide"
          data-testid="coach-close"
          aria-label={t('coach.close')}
          ref={close}
          onClick={onClose}
        >
          {t('coach.hide')}
        </button>
      </div>
      <Coach state={state} />
    </section>
  );
}
