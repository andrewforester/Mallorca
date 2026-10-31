import type { ComponentChildren, Ref } from 'preact';
import type { ViewModel } from '../game/index.ts';
import { t } from './i18n.ts';
import { signed } from './signed.ts';

export interface StatusBarProps {
  vm: ViewModel;
  canLeave: boolean;
  onLeave: () => void;
  logOpen: boolean;
  logToggle: Ref<HTMLButtonElement>;
  onToggleLog: () => void;
  children: ComponentChildren;
}

export function StatusBar({
  vm,
  canLeave,
  onLeave,
  logOpen,
  logToggle,
  onToggleLog,
  children,
}: StatusBarProps) {
  const cash = vm.mode === 'cash';
  const net = signed(vm.session.netBb);
  return (
    <header class="status-bar">
      <div class="status-info">
        <span data-testid="blinds">
          {t('status.blinds', { small: vm.blinds.small, big: vm.blinds.big })}
        </span>
        {cash && (
          <span data-testid="session-result">
            {t('status.result', { sign: net.sign, bb: net.value })}
          </span>
        )}
        <span data-testid="hand-number">{t('status.hand', { number: vm.handNumber })}</span>
      </div>
      {cash && (
        <button
          type="button"
          class="button button-small leave"
          data-testid="leave"
          disabled={!canLeave}
          onClick={onLeave}
        >
          {t('status.leave')}
        </button>
      )}
      <button
        type="button"
        class="log-toggle glass pill"
        data-testid="hand-log-toggle"
        aria-label={t('log.open')}
        aria-expanded={logOpen}
        aria-controls="hand-log"
        ref={logToggle}
        onClick={onToggleLog}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </button>
      {children}
    </header>
  );
}
