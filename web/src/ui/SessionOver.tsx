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
        class="end-link"
        data-testid="export-json"
        onClick={() => void exportHistory(store, sessionId, 'json')}
      >
        {t('history.exportJson')}
      </button>
      <button
        type="button"
        class="end-link"
        data-testid="export-text"
        onClick={() => void exportHistory(store, sessionId, 'text')}
      >
        {t('history.exportText')}
      </button>
    </div>
  );
}

function Stat({ id, value, label }: { id: string; value: string; label: string }) {
  return (
    <p class="end-stat" data-testid={id}>
      <span class="end-stat-value">{value}</span> <span class="end-stat-label">{label}</span>
    </p>
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
        <div class="end-stats">
          <Stat
            id="session-hands"
            value={String(session.hands)}
            label={t('session.hands', { count: session.hands })}
          />
          {rate !== null && (
            <Stat id="session-rate" value={`${rate.sign}${rate.value}`} label={t('session.rate')} />
          )}
        </div>
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
