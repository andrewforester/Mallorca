import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { toViewModel } from '../game/index.ts';
import type { HandStore, Intent, Phase, Session, SeatIndex, ViewModel } from '../game/index.ts';
import { HandLogDrawer } from './HandLogDrawer.tsx';
import { HistoryMenu } from './HistoryMenu.tsx';
import { Scene } from './Scene.tsx';
import { SessionOver } from './SessionOver.tsx';
import { silentPlayer } from './sound/player.ts';
import type { SoundPlayer } from './sound/player.ts';
import { useSoundCues } from './sound/useSoundCues.ts';
import { Settings } from './Settings.tsx';
import { StartScreen } from './StartScreen.tsx';
import { StatusBar } from './StatusBar.tsx';
import { Table } from './Table.tsx';
import { TournamentOver } from './TournamentOver.tsx';
import { useAutoNext } from './useAutoNext.ts';
import { useCoach } from './useCoach.tsx';
import type { CoachView } from './useCoach.tsx';
import { usePreferences } from './usePreferences.ts';
import type { Preferences } from './usePreferences.ts';

export interface AppProps {
  session: Session;
  store: HandStore;
  humanSeat: SeatIndex;
  onNewGame: () => void;
  onLeaveTonight: () => void;
  farewell?: boolean;
  autoNext?: boolean;
  player?: SoundPlayer;
}

function useSessionState(session: Session) {
  const [state, setState] = useState(session.getState());
  useEffect(() => {
    setState(session.getState());
    return session.subscribe(setState);
  }, [session]);
  return state;
}

function useLogDrawer(phase: Phase) {
  const [open, setOpen] = useState(false);
  const ended = phase === 'idle' || phase === 'sessionOver' || phase === 'tournamentOver';
  useEffect(() => {
    if (ended) {
      setOpen(false);
    }
  }, [ended]);
  const toggle = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    toggle.current?.focus();
  }, []);
  const flip = useCallback(() => (open ? close() : setOpen(true)), [open, close]);
  const dismiss = useCallback(() => setOpen(false), []);
  return { open: open && !ended, toggle, close, flip, dismiss };
}

type UnlockingPreferences = Preferences & { unlock: () => void };

function useUnlockingPreferences(player: SoundPlayer): UnlockingPreferences {
  const preferences = usePreferences();
  return {
    ...preferences,
    unlock: () => {
      if (preferences.sound) player.unlock();
    },
    toggleSound: () => {
      if (!preferences.sound) player.unlock();
      preferences.toggleSound();
    },
  };
}

export function App(props: AppProps) {
  const { session, humanSeat } = props;
  const state = useSessionState(session);
  const player = props.player ?? silentPlayer;
  const preferences = useUnlockingPreferences(player);
  const drawer = useLogDrawer(state.phase);
  useSoundCues(session, player, preferences.sound);
  const coach = useCoach(session, state, preferences);
  const vm = state.phase === 'idle' ? null : toViewModel(state, humanSeat);
  const handOver = state.phase === 'handOver' ? vm : null;
  const autoNextMs = useAutoNext(
    session,
    handOver,
    (props.autoNext ?? true) && preferences.autoNext && !drawer.open,
  );
  if (vm === null) {
    return <Start app={props} seed={state.seed} preferences={preferences} />;
  }
  const act = (intent: Intent) => {
    preferences.unlock();
    void session.getState().act(intent);
  };
  return (
    <Scene simple={preferences.simple}>
      <div class="app">
        <Header
          app={props}
          vm={vm}
          seed={state.seed}
          drawer={drawer}
          preferences={preferences}
          coach={coach}
        />
        <Table
          vm={vm}
          phase={state.phase}
          humanSeat={humanSeat}
          autoNextMs={autoNextMs}
          onAct={act}
          onNextHand={() => void session.getState().nextHand()}
          coach={coach.panel}
        />
        {coach.sheet}
        {drawer.open && (
          <HandLogDrawer
            entries={state.log}
            names={[vm.seats[0].name, vm.seats[1].name]}
            humanSeat={humanSeat}
            onClose={drawer.close}
          />
        )}
        <GameOver props={props} vm={vm} phase={state.phase} sessionId={state.sessionId} />
      </div>
    </Scene>
  );
}

function Start({
  app,
  seed,
  preferences,
}: {
  app: AppProps;
  seed: number;
  preferences: UnlockingPreferences;
}) {
  return (
    <StartScreen
      seed={seed}
      simple={preferences.simple}
      farewell={app.farewell ?? false}
      coach={preferences.coach}
      onToggleCoach={preferences.toggleCoach}
      onStart={(mode, opponent) => {
        preferences.unlock();
        void app.session.getState().start(mode, opponent);
      }}
    />
  );
}

interface HeaderProps {
  app: AppProps;
  vm: ViewModel;
  seed: number;
  drawer: ReturnType<typeof useLogDrawer>;
  preferences: Preferences;
  coach: CoachView;
}

function Header({ app, vm, seed, drawer, preferences, coach }: HeaderProps) {
  const phase = app.session.getState().phase;
  return (
    <StatusBar
      vm={vm}
      canLeave={phase === 'handOver'}
      onLeave={() => app.session.getState().leave()}
      logOpen={drawer.open}
      logToggle={drawer.toggle}
      onToggleLog={drawer.flip}
      sound={preferences.sound}
      onToggleSound={preferences.toggleSound}
      coach={coach.toggle}
    >
      <HistoryMenu seed={seed} store={app.store} onNewGame={app.onNewGame} onOpen={drawer.dismiss}>
        <Settings preferences={preferences} />
      </HistoryMenu>
    </StatusBar>
  );
}

interface GameOverProps {
  props: AppProps;
  vm: ViewModel;
  phase: Phase;
  sessionId: string | null;
}

function GameOver({ props, vm, phase, sessionId }: GameOverProps) {
  if (phase === 'sessionOver') {
    return (
      <SessionOver
        session={vm.session}
        store={props.store}
        sessionId={sessionId}
        onPlayAgain={props.onNewGame}
      />
    );
  }
  if (phase === 'tournamentOver') {
    return (
      <TournamentOver
        won={vm.tournamentWinner === props.humanSeat}
        onPlayAgain={props.onNewGame}
        onLeave={props.onLeaveTonight}
      />
    );
  }
  return null;
}
