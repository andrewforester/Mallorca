import type { ComponentChildren, Ref } from 'preact';
import type { ViewModel } from '../game/index.ts';
import { t } from './i18n.ts';
import { signed } from './signed.ts';

export interface StatusBarProps {
  vm: ViewModel;
  logOpen: boolean;
  logToggle: Ref<HTMLButtonElement>;
  onToggleLog: () => void;
  coach?: { open: boolean; onToggle: () => void } | null;
  talk?: ComponentChildren;
  children: ComponentChildren;
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
      class="status-button log-toggle"
      data-testid="hand-log-toggle"
      aria-label={t('log.open')}
      aria-expanded={open}
      aria-controls="hand-log"
      ref={toggle}
      onClick={onToggle}
    >
      {t('status.log')}
    </button>
  );
}

function CoachToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      class="status-button coach-toggle"
      data-testid="coach-toggle"
      aria-expanded={open}
      aria-controls="coach-sheet"
      aria-label={t('coach.open')}
      onClick={onToggle}
    >
      {t('status.coach')}
    </button>
  );
}

export function StatusBar({
  vm,
  logOpen,
  logToggle,
  onToggleLog,
  coach = null,
  talk,
  children,
}: StatusBarProps) {
  const net = signed(vm.session.netBb);
  return (
    <header class="status-bar">
      <div class="status-info">
        <span data-testid="hand-number">{t('status.hand', { number: vm.handNumber })}</span>
        <span data-testid="blinds">
          <span class="blinds-word">{`${t('status.blindsWord')} `}</span>
          {t('status.blinds', { small: vm.blinds.small, big: vm.blinds.big })}
        </span>
        {vm.mode === 'cash' && (
          <span data-testid="session-result">
            {t('status.result', { sign: net.sign, bb: net.value })}
          </span>
        )}
      </div>
      <div class="status-actions">
        {talk}
        <LogToggle open={logOpen} toggle={logToggle} onToggle={onToggleLog} />
        {coach !== null && <CoachToggle open={coach.open} onToggle={coach.onToggle} />}
        {children}
      </div>
    </header>
  );
}
