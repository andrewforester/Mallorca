import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { toViewModel } from '../game/index.ts';
import type { HandStore, Intent, Phase, Session, SeatIndex, ViewModel } from '../game/index.ts';
import { HandLogDrawer } from './HandLogDrawer.tsx';
import { HistoryMenu } from './HistoryMenu.tsx';
import { Scene } from './Scene.tsx';
import { SessionOver } from './SessionOver.tsx';
import { Settings } from './Settings.tsx';
import { StartScreen } from './StartScreen.tsx';
import { StatusBar } from './StatusBar.tsx';
import { Table } from './Table.tsx';
import { TournamentOver } from './TournamentOver.tsx';
import { useAutoNext } from './useAutoNext.ts';
import { usePreferences } from './usePreferences.ts';

export interface AppProps {
  session: Session;
  store: HandStore;
  humanSeat: SeatIndex;
  onNewGame: () => void;
  onLeaveTonight: () => void;
  farewell?: boolean;
  autoNext?: boolean;
}

function useSessionState(session: Session) {
  const [state, setState] = useState(session.getState());
  useEffect(() => {
    setState(session.getState());
    return session.subscribe(setState);
  }, [session]);
  return state;
}

function useLogDrawer() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    toggle.current?.focus();
  }, []);
  const flip = useCallback(() => (open ? close() : setOpen(true)), [open, close]);
  return { open, toggle, close, flip };
}

export function App(props: AppProps) {
  const { session, store, humanSeat, onNewGame } = props;
  const state = useSessionState(session);
  const preferences = usePreferences();
  const drawer = useLogDrawer();
  const vm = state.phase === 'idle' ? null : toViewModel(state, humanSeat);
  const handOver = state.phase === 'handOver' ? vm : null;
  const autoNextMs = useAutoNext(
    session,
    handOver,
    (props.autoNext ?? true) && preferences.autoNext,
  );
  if (vm === null) {
    return (
      <StartScreen
        seed={state.seed}
        simple={preferences.simple}
        farewell={props.farewell ?? false}
        onStart={(mode, opponent) => void session.getState().start(mode, opponent)}
      />
    );
  }
  const act = (intent: Intent) => void session.getState().act(intent);
  const names: [string, string] = [vm.seats[0].name, vm.seats[1].name];
  return (
    <Scene simple={preferences.simple}>
      <div class="app">
        <StatusBar
          vm={vm}
          canLeave={state.phase === 'handOver'}
          onLeave={() => session.getState().leave()}
          logOpen={drawer.open}
          logToggle={drawer.toggle}
          onToggleLog={drawer.flip}
        >
          <HistoryMenu seed={state.seed} store={store} onNewGame={onNewGame}>
            <Settings preferences={preferences} />
          </HistoryMenu>
        </StatusBar>
        <Table
          vm={vm}
          phase={state.phase}
          humanSeat={humanSeat}
          autoNextMs={autoNextMs}
          onAct={act}
          onNextHand={() => void session.getState().nextHand()}
        />
        {drawer.open && (
          <HandLogDrawer
            entries={state.log}
            names={names}
            humanSeat={humanSeat}
            onClose={drawer.close}
          />
        )}
        <GameOver props={props} vm={vm} phase={state.phase} sessionId={state.sessionId} />
      </div>
    </Scene>
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
