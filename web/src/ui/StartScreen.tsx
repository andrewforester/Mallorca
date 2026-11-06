import { useState } from 'preact/hooks';
import { CASH, opponentsFor, TOURNAMENT } from '../game/index.ts';
import type { LoadProgress, Opponent, TableMode } from '../game/index.ts';
import { t } from './i18n.ts';
import { Scene } from './Scene.tsx';
import { PORTRAIT_URL } from './avatar/FaceSeat.tsx';

export interface StartScreenProps {
  onStart: (mode: TableMode, opponent: Opponent) => void;
  seed: number;
  farewell?: boolean;
  simple?: boolean;
  finePointer?: boolean;
  coach?: boolean;
  onToggleCoach?: () => void;
  face?: boolean;
  onChoose?: (opponent: Opponent) => void;
  progress?: LoadProgress | null;
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
    <div class="tonight-tile start-opponent" role="group" aria-label={t('start.opponent')}>
      <span class="tonight-tile-label">{t('start.opponent')}</span>
      <span class="segmented">
        {opponents.map((opponent) => (
          <button
            key={opponent}
            type="button"
            class="segment"
            aria-pressed={opponent === value}
            data-testid={`opponent-${opponent}`}
            onClick={() => onChange(opponent)}
          >
            {t(`start.opponents.${opponent}`)}
          </button>
        ))}
      </span>
    </div>
  );
}

function CoachChoice({ coach, onToggle }: { coach: boolean; onToggle?: () => void }) {
  return (
    <label class="tonight-tile start-coach menu-toggle">
      <span class="tonight-tile-label tonight-tile-coach">{t('start.coach')}</span>
      <input
        type="checkbox"
        role="switch"
        data-testid="start-coach"
        aria-label={t('coach.mode')}
        checked={coach}
        onChange={onToggle}
      />
    </label>
  );
}

function LoadLine({ percent }: { percent: number | null }) {
  return (
    <div class="start-load">
      <p class="start-seed" role="status" data-testid="start-loading">
        {percent === null ? t('start.loading') : t('start.loadingPercent', { percent })}
      </p>
      <span
        class={percent === null ? 'load-bar load-bar-unknown' : 'load-bar'}
        role="progressbar"
        aria-label={t('start.loading')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        style={{ '--load': `${percent ?? 0}%` }}
      />
    </div>
  );
}

function SeedLine({ loading, seed }: { loading: number | null | false; seed: number }) {
  return loading === false ? (
    <p class="start-seed">{t('status.seed', { seed })}</p>
  ) : (
    <LoadLine percent={loading} />
  );
}

function loadShown(
  opponent: Opponent,
  starting: boolean,
  progress: LoadProgress | null,
): number | null | false {
  if (opponent === 'math') return false;
  if (progress !== null && progress.opponent === opponent) {
    return progress.total > 0 ? Math.floor((progress.received / progress.total) * 100) : null;
  }
  return starting ? null : false;
}

function TonightFace({ face, farewell }: { face: boolean; farewell: boolean }) {
  return (
    <div
      class={face ? 'face-frame tonight-face' : 'face-frame face-frame-off tonight-face'}
      data-testid="tonight-face"
    >
      {face ? (
        <img class="face-portrait" src={PORTRAIT_URL} alt={t('seat.bot')} draggable={false} />
      ) : (
        <span class="face-frame-name">{t('seat.bot')}</span>
      )}
      <p class="tonight-line">{farewell ? t('start.farewellTitle') : t('start.greeting')}</p>
    </div>
  );
}

function Tagline({ farewell }: { farewell: boolean }) {
  return farewell ? (
    <p class="tonight-farewell" data-testid="farewell">
      <span class="tonight-farewell-title">{t('start.farewellTitle')}</span>{' '}
      <span>{t('start.farewell')}</span>
    </p>
  ) : (
    <p class="start-tagline">{t('start.tagline')}</p>
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
  face = true,
  onChoose,
  progress = null,
}: StartScreenProps) {
  const [opponent, setOpponent] = useState<Opponent>('math');
  const [starting, setStarting] = useState(false);
  const start = (mode: TableMode) => {
    setStarting(true);
    onStart(mode, opponent);
  };
  return (
    <Scene dimmed simple={simple}>
      <main class="start-screen tonight">
        <header class="tonight-head">
          <h1 class="start-title">{t('start.heading')}</h1>
        </header>
        <TonightFace face={face} farewell={farewell} />
        <div class="tonight-body">
          <Tagline farewell={farewell} />
          <OpponentChoice
            value={opponent}
            onChange={(next) => {
              setOpponent(next);
              onChoose?.(next);
            }}
            opponents={opponentsFor(finePointer)}
          />
          <CoachChoice coach={coach} onToggle={onToggleCoach} />
          <SeedLine loading={loadShown(opponent, starting, progress)} seed={seed} />
          <div class="start-actions">
            <button
              type="button"
              class="button button-passive"
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
        </div>
      </main>
    </Scene>
  );
}
