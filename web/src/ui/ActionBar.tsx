import { useEffect, useState } from 'preact/hooks';
import type { Intent, RaiseControl, ViewModel } from '../game/index.ts';
import { BetSlider } from './BetSlider.tsx';
import { t } from './i18n.ts';
import { useKeyboard } from './keyboard.ts';
import { useHold } from './useHold.ts';
import type { Hold } from './useHold.ts';

export const HOLD_MS = 600;

export interface ActionBarProps {
  controls: ViewModel['controls'];
  onAct: (intent: Intent) => void;
}

type Mode = 'buttons' | 'size';

function KeyHint({ letter }: { letter: string }) {
  return (
    <span class="key-hint" aria-hidden="true">
      {letter}
    </span>
  );
}

function raiseLabel(raise: RaiseControl | null, amount: number): string {
  if (raise === null) return t('actions.raise');
  return t(raise.kind === 'bet' ? 'actions.bet' : 'actions.raiseTo', { amount });
}

function passiveLabel(passive: ViewModel['controls']['passive']): string {
  return passive.kind === 'check'
    ? t('actions.check')
    : t('actions.call', { amount: passive.amount });
}

interface ButtonsProps {
  controls: ViewModel['controls'];
  onFold: () => void;
  onPassive: () => void;
  onOpen: () => void;
}

function Buttons({ controls, onFold, onPassive, onOpen }: ButtonsProps) {
  const { enabled, fold, passive, raise } = controls;
  return (
    <div class="action-buttons">
      <button
        type="button"
        class="button button-fold"
        data-testid="fold"
        disabled={!enabled || !fold}
        onClick={onFold}
      >
        <span>{t('actions.fold')}</span>
        <KeyHint letter={t('actions.keyFold')} />
      </button>
      <button
        type="button"
        class="button button-passive"
        data-testid="passive"
        disabled={!enabled}
        onClick={onPassive}
      >
        <span>{passiveLabel(passive)}</span>
        <KeyHint letter={t('actions.keyPassive')} />
      </button>
      <button
        type="button"
        class="button button-raise"
        data-testid="raise"
        disabled={!enabled || raise === null}
        onClick={onOpen}
      >
        <span>{raiseLabel(raise, raise?.min ?? 0)}</span>
        <KeyHint letter={t('actions.keyRaise')} />
      </button>
    </div>
  );
}

interface SheetProps {
  raise: RaiseControl;
  amount: number;
  hold: Hold;
  onChange: (amount: number) => void;
  actions: { back: () => void; confirm: () => void };
}

function ConfirmButton({ raise, amount, hold, actions }: Omit<SheetProps, 'onChange'>) {
  const allIn = amount >= raise.max;
  return (
    <button
      type="button"
      class={`button button-raise${allIn ? ' button-hold' : ''}${hold.holding ? ' button-holding' : ''}`}
      style={{ '--hold-ms': `${HOLD_MS}ms` }}
      data-testid="raise-confirm"
      onClick={allIn ? undefined : actions.confirm}
      onPointerDown={allIn ? hold.start : undefined}
      onPointerUp={allIn ? hold.stop : undefined}
      onPointerLeave={allIn ? hold.stop : undefined}
      onPointerCancel={allIn ? hold.stop : undefined}
    >
      <span>{allIn ? t('actions.holdAllIn', { amount }) : raiseLabel(raise, amount)}</span>
    </button>
  );
}

function Sheet(props: SheetProps) {
  const { raise, amount, onChange, actions } = props;
  return (
    <div class="bet-sheet">
      <div class="bet-sheet-head">
        <span class="bet-sheet-verb">
          {t(raise.kind === 'bet' ? 'actions.betVerb' : 'actions.raiseVerb')}
        </span>
        <span class="bet-sheet-size" data-testid="raise-size">
          {amount}
        </span>
      </div>
      <BetSlider raise={raise} value={amount} disabled={false} onChange={onChange} />
      <div class="bet-sheet-buttons">
        <button type="button" class="button" data-testid="raise-back" onClick={actions.back}>
          {t('actions.back')}
        </button>
        <ConfirmButton {...props} />
      </div>
    </div>
  );
}

function useActionState(controls: ViewModel['controls']) {
  const [mode, setMode] = useState<Mode>('buttons');
  const [chosen, setChosen] = useState<number | null>(null);
  const { enabled, raise } = controls;
  useEffect(() => {
    if (!enabled) {
      setMode('buttons');
      setChosen(null);
    }
  }, [enabled]);
  const amount = raise === null ? 0 : Math.min(Math.max(chosen ?? raise.min, raise.min), raise.max);
  return { mode, setMode, amount, setChosen };
}

export function ActionBar({ controls, onAct }: ActionBarProps) {
  const { enabled, fold, raise } = controls;
  const state = useActionState(controls);
  const { mode, setMode, amount } = state;
  const raiseTo = () => onAct({ kind: 'raise', to: amount });
  const hold = useHold(HOLD_MS, raiseTo);
  const allIn = raise !== null && amount >= raise.max;
  const doFold = () => onAct({ kind: 'fold' });
  const doPassive = () => onAct({ kind: 'passive' });
  const open = () => raise !== null && setMode('size');
  const back = () => setMode('buttons');
  const sizing = mode === 'size' && raise !== null;
  useKeyboard({
    enabled,
    fold: () => mode === 'buttons' && fold && doFold(),
    passive: () => mode === 'buttons' && doPassive(),
    raise: () => mode === 'buttons' && open(),
    adjust: (direction) => {
      if (sizing)
        state.setChosen(Math.min(Math.max(amount + direction * raise.step, raise.min), raise.max));
    },
    confirm: () => {
      if (!sizing) return false;
      if (allIn) hold.start();
      else raiseTo();
      return true;
    },
    back: () => {
      if (mode === 'buttons') return false;
      back();
      return true;
    },
    release: hold.stop,
  });
  return (
    <div class="action-bar" role="group" aria-label={t('actions.label')}>
      {sizing && (
        <Sheet
          raise={raise}
          amount={amount}
          hold={hold}
          onChange={state.setChosen}
          actions={{ back, confirm: raiseTo }}
        />
      )}
      {mode === 'buttons' && (
        <Buttons
          controls={controls}
          onFold={doFold}
          onPassive={doPassive}
          onOpen={() => void open()}
        />
      )}
    </div>
  );
}
