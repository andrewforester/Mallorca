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
  onClose?: () => void;
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

function MenuSummary() {
  return (
    <>
      <summary class="status-button menu-summary" aria-label={t('status.menu')}>
        <span class="menu-glyph" aria-hidden="true">
          {t('status.menuGlyph')}
        </span>
        <span class="menu-word" aria-hidden="true">
          {t('status.menu')}
        </span>
      </summary>
      <div
        class="menu-scrim"
        aria-hidden="true"
        onClick={(event) => {
          const menu = (event.currentTarget as HTMLElement).closest('details');
          if (menu !== null) menu.open = false;
        }}
      />
    </>
  );
}

export function HistoryMenu(props: HistoryMenuProps) {
  const { seed, store, onNewGame, onOpen, onClose, children } = props;
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
          onClose?.();
        }
      }}
    >
      <MenuSummary />
      <div class="menu-body">
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
