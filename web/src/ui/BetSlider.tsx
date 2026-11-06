import type { RaiseControl } from '../game/index.ts';
import { t } from './i18n.ts';

export interface BetSliderProps {
  raise: RaiseControl;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

interface Preset {
  id: string;
  label: string;
  amount: number;
}

function presetsOf(raise: RaiseControl): Preset[] {
  const { presets } = raise;
  const middle =
    presets.pot >= raise.max
      ? { id: 'min', label: t('actions.min'), amount: raise.min }
      : { id: 'pot', label: t('actions.pot'), amount: presets.pot };
  return [
    { id: 'half', label: t('actions.half'), amount: presets.halfPot },
    middle,
    { id: 'allin', label: t('actions.allIn'), amount: presets.allIn },
  ];
}

function Presets({ raise, value, disabled, onChange }: BetSliderProps) {
  return (
    <div class="bet-presets">
      {presetsOf(raise).map((preset) => (
        <button
          key={preset.id}
          type="button"
          class="bet-preset"
          data-testid={`preset-${preset.id}`}
          aria-pressed={preset.amount === value}
          disabled={disabled}
          onClick={() => onChange(preset.amount)}
        >
          <span class="bet-preset-label">{preset.label}</span>
          <span class="bet-preset-value">{preset.amount}</span>
        </button>
      ))}
    </div>
  );
}

function Stepper({ raise, value, disabled, onChange }: BetSliderProps) {
  const step = (direction: 1 | -1) =>
    onChange(Math.min(Math.max(value + direction * raise.step, raise.min), raise.max));
  return (
    <div class="bet-slider">
      <button
        type="button"
        class="bet-step"
        data-testid="raise-less"
        aria-label={t('actions.less')}
        disabled={disabled || value <= raise.min}
        onClick={() => step(-1)}
      >
        {t('actions.lessGlyph')}
      </button>
      <div class="bet-track">
        <input
          class="bet-range"
          type="range"
          data-testid="raise-amount"
          aria-label={t('actions.amount')}
          min={raise.min}
          max={raise.max}
          step={1}
          value={value}
          disabled={disabled}
          style={{
            '--fill': `${((value - raise.min) / Math.max(1, raise.max - raise.min)) * 100}%`,
          }}
          onInput={(event) => onChange(Number((event.currentTarget as HTMLInputElement).value))}
        />
        <span class="bet-limits" aria-hidden="true">
          <span>{raise.min}</span>
          <span>{raise.max}</span>
        </span>
      </div>
      <button
        type="button"
        class="bet-step"
        data-testid="raise-more"
        aria-label={t('actions.more')}
        disabled={disabled || value >= raise.max}
        onClick={() => step(1)}
      >
        {t('actions.moreGlyph')}
      </button>
    </div>
  );
}

export function BetSlider(props: BetSliderProps) {
  return (
    <>
      <Presets {...props} />
      <Stepper {...props} />
    </>
  );
}
