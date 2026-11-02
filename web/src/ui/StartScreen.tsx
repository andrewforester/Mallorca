import { useState } from 'preact/hooks';
import { CASH, opponentsFor, TOURNAMENT } from '../game/index.ts';
import type { Opponent, TableMode } from '../game/index.ts';
import { t } from './i18n.ts';
import { Scene } from './Scene.tsx';

export interface StartScreenProps {
  onStart: (mode: TableMode, opponent: Opponent) => void;
  seed: number;
  farewell?: boolean;
  simple?: boolean;
  finePointer?: boolean;
  coach?: boolean;
  onToggleCoach?: () => void;
}

function OpponentChoice({
  value,
  onChange,
  opponents,
}: {
  value: Opponent;
  onChange: (opponent: Opponent) => void;
  opponents: readonly Opponent[];
}) {
  return (
    <div class="start-opponent" role="group" aria-label={t('start.opponent')}>
      <span class="start-opponent-label">{t('start.opponent')}</span>
      {opponents.map((opponent) => (
        <button
          key={opponent}
          type="button"
          class="button button-small"
          aria-pressed={opponent === value}
          data-testid={`opponent-${opponent}`}
          onClick={() => onChange(opponent)}
        >
          {t(`start.opponents.${opponent}`)}
        </button>
      ))}
    </div>
  );
}

function CoachChoice({ coach, onToggle }: { coach: boolean; onToggle?: () => void }) {
  return (
    <label class="start-coach">
      <input type="checkbox" data-testid="start-coach" checked={coach} onChange={onToggle} />
      <span>{t('coach.mode')}</span>
    </label>
  );
}

function SeedLine({ loading, seed }: { loading: boolean; seed: number }) {
  return loading ? (
    <p class="start-seed" role="status" data-testid="start-loading">
      {t('start.loading')}
    </p>
  ) : (
    <p class="start-seed">{t('status.seed', { seed })}</p>
  );
}

function hasFinePointer(): boolean {
  return globalThis.matchMedia?.('(pointer: fine)').matches ?? true;
}

export function StartScreen({
  onStart,
  seed,
  farewell = false,
  simple = false,
  finePointer = hasFinePointer(),
  coach = false,
  onToggleCoach,
}: StartScreenProps) {
  const [opponent, setOpponent] = useState<Opponent>('math');
  const [starting, setStarting] = useState(false);
  const start = (mode: TableMode) => {
    setStarting(true);
    onStart(mode, opponent);
  };
  return (
    <Scene dimmed simple={simple}>
      <main class="start-screen">
        <h1 class="start-title">{t('start.heading')}</h1>
        {farewell ? (
          <p class="start-tagline" data-testid="farewell">
            {t('start.farewell')}
          </p>
        ) : (
          <p class="start-tagline">{t('start.tagline')}</p>
        )}
        <OpponentChoice
          value={opponent}
          onChange={setOpponent}
          opponents={opponentsFor(finePointer)}
        />
        <CoachChoice coach={coach} onToggle={onToggleCoach} />
        <div class="start-actions">
          <button
            type="button"
            class="button button-primary"
            data-testid="start-cash"
            onClick={() => start(CASH)}
          >
            {t('start.cash')}
          </button>
          <button
            type="button"
            class="button"
            data-testid="start-tournament"
            onClick={() => start(TOURNAMENT)}
          >
            {t('start.tournament')}
          </button>
        </div>
        <SeedLine loading={starting && opponent !== 'math'} seed={seed} />
      </main>
    </Scene>
  );
}
