import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { HandStore } from '../game/index.ts';
import { clearHistory, exportHistory } from './history.ts';
import { t } from './i18n.ts';

export interface HistoryMenuProps {
  seed: number;
  store: HandStore;
  onNewGame: () => void;
  onOpen?: () => void;
  children?: ComponentChildren;
}

function ExportButtons({ store }: { store: HandStore }) {
  return (
    <>
      <button
        type="button"
        class="button button-small"
        data-testid="export-all-json"
        onClick={() => void exportHistory(store, null, 'json')}
      >
        {t('history.exportAllJson')}
      </button>
      <button
        type="button"
        class="button button-small"
        data-testid="export-all-text"
        onClick={() => void exportHistory(store, null, 'text')}
      >
        {t('history.exportAllText')}
      </button>
    </>
  );
}

export function HistoryMenu({ seed, store, onNewGame, onOpen, children }: HistoryMenuProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const clear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    void clearHistory(store);
  };
  return (
    <details
      class="menu"
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open) {
          onOpen?.();
        } else {
          setConfirmClear(false);
        }
      }}
    >
      <summary class="menu-summary glass pill">{t('status.menu')}</summary>
      <div class="menu-body glass">
        {children}
        <span>{t('status.seed', { seed })}</span>
        <button
          type="button"
          class="button button-small"
          data-testid="new-game"
          onClick={onNewGame}
        >
          {t('status.newGame')}
        </button>
        <ExportButtons store={store} />
        <button
          type="button"
          class="button button-small"
          data-testid="clear-history"
          onClick={clear}
        >
          {t(confirmClear ? 'history.clearConfirm' : 'history.clear')}
        </button>
      </div>
    </details>
  );
}
