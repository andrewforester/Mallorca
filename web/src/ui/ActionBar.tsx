import { useEffect, useState } from 'preact/hooks';
import type { Intent, RaiseControl, ViewModel } from '../game/index.ts';
import { BetSlider, defaultSize } from './BetSlider.tsx';
import { t } from './i18n.ts';
import { useKeyboard } from './keyboard.ts';
import type { PresetKey } from './keyboard.ts';
import { useHold } from './useHold.ts';
import type { Hold } from './useHold.ts';

export const HOLD_MS = 600;

export interface ActionBarProps {
  controls: ViewModel['controls'];
  onAct: (intent: Intent) => void;
}

function KeyHint({ letter }: { letter: string }) {
  return (
    <span class="key-hint" aria-hidden="true">
      {letter}
    </span>
  );
}

function raiseLabel(raise: RaiseControl | null, amount: number): string {
  if (raise === null) return t('actions.raise');
  if (raise.min >= raise.max) return t('actions.allInTo', { amount });
  if (amount >= raise.max) return t('actions.holdAllIn', { amount });
  return t(raise.kind === 'bet' ? 'actions.bet' : 'actions.raiseTo', { amount });
}

function needsHold(raise: RaiseControl | null, amount: number): boolean {
  return raise !== null && raise.min < raise.max && amount >= raise.max;
}

function passiveLabel(passive: ViewModel['controls']['passive']): string {
  return passive.kind === 'check'
    ? t('actions.check')
    : t('actions.call', { amount: passive.amount });
}

interface RaiseButtonProps {
  controls: ViewModel['controls'];
  amount: number;
  hold: Hold;
  onRaise: () => void;
}

function RaiseButton({ controls, amount, hold, onRaise }: RaiseButtonProps) {
  const { enabled, raise } = controls;
  const allIn = needsHold(raise, amount);
  const classes = [
    'button',
    'button-raise',
    allIn ? 'button-hold' : '',
    hold.holding ? 'button-holding' : '',
    allIn && hold.nudged ? 'button-nudge' : '',
  ];
  return (
    <button
      type="button"
      class={classes.filter(Boolean).join(' ')}
      style={{ '--hold-ms': `${HOLD_MS}ms` }}
      data-testid="raise"
      disabled={!enabled || raise === null}
      onClick={allIn ? undefined : onRaise}
      onPointerDown={allIn ? hold.start : undefined}
      onPointerUp={allIn ? hold.stop : undefined}
      onPointerLeave={allIn ? hold.stop : undefined}
      onPointerCancel={allIn ? hold.stop : undefined}
    >
      <span>{raiseLabel(raise, amount)}</span>
      <KeyHint letter={t('actions.keyRaise')} />
    </button>
  );
}

interface ButtonsProps extends RaiseButtonProps {
  onFold: () => void;
  onPassive: () => void;
}

function Buttons(props: ButtonsProps) {
  const { controls, onFold, onPassive } = props;
  return (
    <div class="action-buttons">
      <button
        type="button"
        class="button button-fold"
        data-testid="fold"
        disabled={!controls.enabled || !controls.fold}
        onClick={onFold}
      >
        <span>{t('actions.fold')}</span>
        <KeyHint letter={t('actions.keyFold')} />
      </button>
      <button
        type="button"
        class="button button-passive"
        data-testid="passive"
        disabled={!controls.enabled}
        onClick={onPassive}
      >
        <span>{passiveLabel(controls.passive)}</span>
        <KeyHint letter={t('actions.keyPassive')} />
      </button>
      <RaiseButton {...props} />
    </div>
  );
}

interface SizeProps {
  raise: RaiseControl;
  amount: number;
  enabled: boolean;
  onChange: (amount: number) => void;
}

function Size({ raise, amount, enabled, onChange }: SizeProps) {
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
      <BetSlider raise={raise} value={amount} disabled={!enabled} onChange={onChange} />
    </div>
  );
}

function useSize(controls: ViewModel['controls']) {
  const [chosen, setChosen] = useState<number | null>(null);
  const { enabled, raise } = controls;
  useEffect(() => {
    if (!enabled) setChosen(null);
  }, [enabled]);
  const clamp = (value: number) =>
    raise === null ? 0 : Math.min(Math.max(value, raise.min), raise.max);
  const amount = raise === null ? 0 : clamp(chosen ?? defaultSize(raise));
  const step = (direction: 1 | -1) => {
    if (raise !== null) setChosen(clamp(amount + direction * raise.step));
  };
  const pick = (id: PresetKey) => {
    if (raise === null) return;
    const { halfPot, pot, allIn } = raise.presets;
    if (id === 'half') setChosen(halfPot);
    if (id === 'allin') setChosen(allIn);
    if (id === 'pot' && pot < raise.max) setChosen(pot);
  };
  return { amount, setChosen, step, pick };
}

export function ActionBar({ controls, onAct }: ActionBarProps) {
  const { enabled, fold, raise } = controls;
  const size = useSize(controls);
  const raiseTo = () => onAct({ kind: 'raise', to: size.amount });
  const hold = useHold(HOLD_MS, raiseTo);
  const allIn = needsHold(raise, size.amount);
  const doFold = () => onAct({ kind: 'fold' });
  const doPassive = () => onAct({ kind: 'passive' });
  useKeyboard({
    enabled,
    fold: () => fold && doFold(),
    passive: doPassive,
    raise: () => {
      if (raise === null) return;
      if (allIn) hold.start();
      else raiseTo();
    },
    adjust: size.step,
    preset: size.pick,
    release: hold.stop,
  });
  return (
    <div class="action-bar" role="group" aria-label={t('actions.label')}>
      {raise !== null && (
        <Size raise={raise} amount={size.amount} enabled={enabled} onChange={size.setChosen} />
      )}
      <Buttons
        controls={controls}
        amount={size.amount}
        hold={hold}
        onRaise={raiseTo}
        onFold={doFold}
        onPassive={doPassive}
      />
    </div>
  );
}
