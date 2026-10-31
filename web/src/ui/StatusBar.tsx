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
  sound: boolean;
  onToggleSound: () => void;
  children: ComponentChildren;
}

function SoundToggle({ sound, onToggle }: { sound: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      class="log-toggle glass pill sound-toggle"
      data-testid="sound-toggle"
      aria-label={t('status.sound')}
      aria-pressed={sound}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <path
          d={sound ? 'M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11' : 'M16 9.5l5 5M21 9.5l-5 5'}
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
    </button>
  );
}

interface LogToggleProps {
  open: boolean;
  toggle: Ref<HTMLButtonElement>;
  onToggle: () => void;
}

function LogToggle({ open, toggle, onToggle }: LogToggleProps) {
  return (
    <button
      type="button"
      class="log-toggle glass pill"
      data-testid="hand-log-toggle"
      aria-label={t('log.open')}
      aria-expanded={open}
      aria-controls="hand-log"
      ref={toggle}
      onClick={onToggle}
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
  );
}

export function StatusBar({
  vm,
  canLeave,
  onLeave,
  logOpen,
  logToggle,
  onToggleLog,
  sound,
  onToggleSound,
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
      <SoundToggle sound={sound} onToggle={onToggleSound} />
      <LogToggle open={logOpen} toggle={logToggle} onToggle={onToggleLog} />
      {children}
    </header>
  );
}
