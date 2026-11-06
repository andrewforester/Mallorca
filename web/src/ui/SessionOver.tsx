import type { HandStore, ViewModel } from '../game/index.ts';
import { exportHistory } from './history.ts';
import { t } from './i18n.ts';
import { signed } from './signed.ts';

export interface SessionOverProps {
  session: ViewModel['session'];
  store: HandStore;
  sessionId: string | null;
  onPlayAgain: () => void;
  onLeave: () => void;
}

function Exports({ store, sessionId }: { store: HandStore; sessionId: string | null }) {
  return (
    <div class="end-exports">
      <button
        type="button"
        class="button button-small"
        data-testid="export-json"
        onClick={() => void exportHistory(store, sessionId, 'json')}
      >
        {t('history.exportJson')}
      </button>
      <button
        type="button"
        class="button button-small"
        data-testid="export-text"
        onClick={() => void exportHistory(store, sessionId, 'text')}
      >
        {t('history.exportText')}
      </button>
    </div>
  );
}

export function SessionOver(props: SessionOverProps) {
  const { session, store, sessionId, onPlayAgain, onLeave } = props;
  const net = signed(session.netBb);
  const rate = session.bbPer100 === null ? null : signed(session.bbPer100);
  return (
    <div class="overlay" data-testid="session-over" role="dialog" aria-modal="true">
      <div class="dialog end-panel">
        <h2 class="dialog-title">{t('session.title')}</h2>
        <p class="dialog-line">{t('session.thanks')}</p>
        <p class="end-number" data-testid="session-summary">
          {t('session.summary', { sign: net.sign, bb: net.value })}
        </p>
        <p class="end-detail">
          <span data-testid="session-hands">{t('session.hands', { count: session.hands })}</span>
          {rate !== null && (
            <span data-testid="session-rate">
              {t('session.rate', { rate: `${rate.sign}${rate.value}` })}
            </span>
          )}
        </p>
        <Exports store={store} sessionId={sessionId} />
        <div class="end-actions">
          <button type="button" class="button" data-testid="play-again" onClick={onPlayAgain}>
            {t('session.again')}
          </button>
          <button type="button" class="button" data-testid="leave-tonight" onClick={onLeave}>
            {t('session.leave')}
          </button>
        </div>
      </div>
    </div>
  );
}
