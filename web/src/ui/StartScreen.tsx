import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { CASH, CHARACTERS, opponentsFor, TOURNAMENT } from '../game/index.ts';
import type { LoadProgress, Opponent, PersonalityKey, TableMode } from '../game/index.ts';
import { t } from './i18n.ts';
import { ATTIC_URL, FaceFrame } from './FaceFrame.tsx';
import { Scene } from './Scene.tsx';

export interface StartScreenProps {
  onStart: (mode: TableMode, opponent: Opponent) => void;
  farewell?: boolean;
  simple?: boolean;
  finePointer?: boolean;
  coach?: boolean;
  onToggleCoach?: () => void;
  face?: ComponentChildren;
  onChoose?: (opponent: Opponent) => void;
  progress?: LoadProgress | null;
  opponent?: Opponent;
  character?: PersonalityKey;
  onCharacter?: (character: PersonalityKey) => void;
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
      <p class="start-load-line" role="status" data-testid="start-loading">
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

function CharacterChoice({
  value,
  onChange,
}: {
  value: PersonalityKey;
  onChange: (character: PersonalityKey) => void;
}) {
  return (
    <section class="characters" aria-label={t('start.who')}>
      <h2 class="characters-title">{t('start.who')}</h2>
      <div class="characters-list">
        {CHARACTERS.map((key) => (
          <button
            key={key}
            type="button"
            class="character"
            aria-pressed={key === value}
            data-testid={`character-${key}`}
            onClick={() => onChange(key)}
          >
            <span class="character-top">
              <span class="character-name">{t(`start.characters.${key}.name`)}</span>
              <span class="character-hard">{t(`start.characters.${key}.hard`)}</span>
            </span>
            <span class="character-line">{t(`start.characters.${key}.line`)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

interface TonightFaceProps {
  face: ComponentChildren;
  farewell: boolean;
  character: PersonalityKey | undefined;
}

function TonightFace({ face, farewell, character }: TonightFaceProps) {
  const name = character === undefined ? t('seat.bot') : t(`start.characters.${character}.name`);
  const hello =
    character === undefined ? t('start.greeting') : t(`start.characters.${character}.hello`);
  return (
    <div class="tonight-scene" data-testid="tonight-face">
      <img class="face-blur" src={ATTIC_URL} alt="" aria-hidden="true" decoding="async" />
      <FaceFrame name={name} face={face} />
      <p class="tonight-line">{farewell ? t('start.farewellTitle') : hello}</p>
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

interface ChoicesProps {
  fixed: Opponent | undefined;
  opponent: Opponent;
  onOpponent: (opponent: Opponent) => void;
  coach: boolean;
  onToggleCoach: (() => void) | undefined;
  finePointer: boolean;
}

function Choices(props: ChoicesProps) {
  return (
    <>
      {props.fixed === undefined && (
        <OpponentChoice
          value={props.opponent}
          onChange={props.onOpponent}
          opponents={opponentsFor(props.finePointer)}
        />
      )}
      {props.onToggleCoach !== undefined && (
        <CoachChoice coach={props.coach} onToggle={props.onToggleCoach} />
      )}
    </>
  );
}

function useOpponent(
  fixed: Opponent | undefined,
  onChoose: ((opponent: Opponent) => void) | undefined,
): [Opponent, (opponent: Opponent) => void] {
  const [opponent, setOpponent] = useState<Opponent>(fixed ?? 'math');
  useEffect(() => {
    if (fixed !== undefined) onChoose?.(fixed);
  }, [fixed]);
  return [
    opponent,
    (next) => {
      setOpponent(next);
      onChoose?.(next);
    },
  ];
}

function StartActions({ onStart }: { onStart: (mode: TableMode) => void }) {
  return (
    <div class="start-actions">
      <button
        type="button"
        class="start-main"
        data-testid="start-cash"
        onClick={() => onStart(CASH)}
      >
        <span class="start-main-label">{t('start.sit')}</span>
        <span class="start-main-detail">{t('start.cash')}</span>
      </button>
      <button
        type="button"
        class="start-second"
        data-testid="start-tournament"
        onClick={() => onStart(TOURNAMENT)}
      >
        {t('start.tournament')}
      </button>
    </div>
  );
}

function hasFinePointer(): boolean {
  return globalThis.matchMedia?.('(pointer: fine)').matches ?? true;
}

export function StartScreen({
  onStart,
  farewell = false,
  simple = false,
  finePointer = hasFinePointer(),
  coach = false,
  onToggleCoach,
  face,
  onChoose,
  progress = null,
  opponent: fixed,
  character,
  onCharacter,
}: StartScreenProps) {
  const [opponent, choose] = useOpponent(fixed, onChoose);
  const [starting, setStarting] = useState(false);
  const start = (mode: TableMode) => {
    setStarting(true);
    onStart(mode, opponent);
  };
  const loading = loadShown(opponent, starting, progress);
  return (
    <Scene dimmed simple={simple}>
      <main class="start-screen tonight">
        <TonightFace face={face} farewell={farewell} character={character} />
        <div class="tonight-body">
          {onCharacter !== undefined && (
            <CharacterChoice value={character ?? 'mallorca'} onChange={onCharacter} />
          )}
          <div class="tonight-go">
            <Choices
              fixed={fixed}
              opponent={opponent}
              onOpponent={choose}
              coach={coach}
              onToggleCoach={onToggleCoach}
              finePointer={finePointer}
            />
            {loading !== false && <LoadLine percent={loading} />}
            <Tagline farewell={farewell} />
            <StartActions onStart={start} />
          </div>
        </div>
      </main>
    </Scene>
  );
}
