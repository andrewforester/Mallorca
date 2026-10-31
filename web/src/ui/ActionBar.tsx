import { useState } from 'preact/hooks';
import type { Intent, ViewModel } from '../game/index.ts';
import { BetSlider } from './BetSlider.tsx';
import { t } from './i18n.ts';
import { useKeyboard } from './keyboard.ts';

export interface ActionBarProps {
  controls: ViewModel['controls'];
  onAct: (intent: Intent) => void;
}

export function ActionBar({ controls, onAct }: ActionBarProps) {
  const { enabled, fold, passive, raise } = controls;
  const [chosen, setChosen] = useState<number | null>(null);
  const amount = raise === null ? 0 : Math.min(Math.max(chosen ?? raise.min, raise.min), raise.max);
  const canRaise = enabled && raise !== null;

  const doFold = () => onAct({ kind: 'fold' });
  const doPassive = () => onAct({ kind: 'passive' });
  const doRaise = () => onAct({ kind: 'raise', to: amount });

  useKeyboard({
    enabled,
    fold: () => fold && doFold(),
    passive: doPassive,
    raise: () => canRaise && doRaise(),
    adjust: (direction) => {
      if (raise !== null) {
        const step = Math.max(1, Math.round((raise.max - raise.min) / 20));
        setChosen(Math.min(Math.max(amount + direction * step, raise.min), raise.max));
      }
    },
  });

  return (
    <div class="action-bar" role="group" aria-label={t('actions.label')}>
      {raise !== null && (
        <BetSlider raise={raise} value={amount} disabled={!enabled} onChange={setChosen} />
      )}
      <ActionButtons
        state={{ enabled, fold, passive, canRaise, amount, raiseKind: raise?.kind ?? 'raise' }}
        onFold={doFold}
        onPassive={doPassive}
        onRaise={doRaise}
      />
    </div>
  );
}

interface ActionButtonsProps {
  state: {
    enabled: boolean;
    fold: boolean;
    passive: ViewModel['controls']['passive'];
    canRaise: boolean;
    amount: number;
    raiseKind: 'bet' | 'raise';
  };
  onFold: () => void;
  onPassive: () => void;
  onRaise: () => void;
}

function ActionButtons({ state, onFold, onPassive, onRaise }: ActionButtonsProps) {
  const { enabled, fold, passive, canRaise, amount, raiseKind } = state;
  return (
    <div class="action-buttons">
      <button
        type="button"
        class="button button-fold"
        data-testid="fold"
        disabled={!enabled || !fold}
        onClick={onFold}
      >
        {t('actions.fold')}
      </button>
      <button
        type="button"
        class="button button-passive"
        data-testid="passive"
        disabled={!enabled}
        onClick={onPassive}
      >
        {passive.kind === 'check'
          ? t('actions.check')
          : t('actions.call', { amount: passive.amount })}
      </button>
      <button
        type="button"
        class="button button-raise"
        data-testid="raise"
        disabled={!canRaise}
        onClick={onRaise}
      >
        {canRaise
          ? t(raiseKind === 'bet' ? 'actions.bet' : 'actions.raiseTo', { amount })
          : t('actions.raise')}
      </button>
    </div>
  );
}
