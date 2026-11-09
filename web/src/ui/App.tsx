import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { toViewModel } from '../game/index.ts';
import type {
  HandStore,
  Intent,
  LoadProgress,
  Opponent,
  Phase,
  QuickPhrase,
  Session,
  SeatIndex,
  ViewModel,
} from '../game/index.ts';
import { TalkButton } from './ChatSheet.tsx';
import { ALL_FEATURES } from './features.ts';
import type { Features } from './features.ts';
import { tableLayer, useLogDrawer, useTalk } from './layers.tsx';
import type { LogDrawer, Talk } from './layers.tsx';
import { t } from './i18n.ts';
import { HistoryMenu } from './HistoryMenu.tsx';
import { Scene } from './Scene.tsx';
import { SessionOver } from './SessionOver.tsx';
import { silentPlayer } from './sound/player.ts';
import type { SoundPlayer } from './sound/player.ts';
import { useSoundCues } from './sound/useSoundCues.ts';
import { Settings } from './Settings.tsx';
import { StartScreen } from './StartScreen.tsx';
import { StatusBar } from './StatusBar.tsx';
import { FaceSeat } from './avatar/FaceSeat.tsx';
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
  debugPanel?: ComponentType<{ session: Session }>;
  features?: Features;
  opponent?: Opponent;
}

function useSessionState(session: Session) {
  const [state, setState] = useState(session.getState());
  useEffect(() => {
    setState(session.getState());
    return session.subscribe(setState);
  }, [session]);
  return state;
}

function conversationActions(session: Session, vm: ViewModel) {
  return {
    conversation: vm.conversation.available,
    conversationOn: vm.conversation.on,
    onConversation: (on: boolean) => session.getState().setConversation(on),
    onSay: (text: string) => session.getState().say(text),
    onQuick: (id: QuickPhrase, text: string) => session.getState().quick(id, text),
  };
}

function useFaceSwitch(session: Session, on: boolean) {
  useEffect(() => {
    session.getState().setFace(on);
  }, [session, on]);
}

function faceSlot(session: Session, vm: ViewModel, preferences: Preferences) {
  if (!preferences.face) {
    return undefined;
  }
  return (thinking: boolean) => (
    <FaceSeat
      session={session}
      cues={vm.face.cues}
      thinking={thinking}
      line={vm.conversation.herBubble}
      voice={preferences.voice}
    />
  );
}

function useAdvance(
  props: AppProps,
  handOver: ViewModel | null,
  { on, logOpen }: { on: boolean; logOpen: boolean },
) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [waited, wait] = useState<number | null>(null);
  const enabled =
    (props.autoNext ?? true) && on && !logOpen && !menuOpen && waited !== handOver?.handNumber;
  const autoNextMs = useAutoNext(props.session, handOver, enabled);
  return { pause: { setMenuOpen, wait }, autoNextMs };
}

function offeredCoach(props: AppProps, preferences: Preferences): Preferences {
  return (props.features ?? ALL_FEATURES).coach ? preferences : { ...preferences, coach: false };
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

function actWith(session: Session, preferences: UnlockingPreferences) {
  return (intent: Intent) => {
    preferences.unlock();
    void session.getState().act(intent);
  };
}

export function App(props: AppProps) {
  const { session, humanSeat } = props;
  const state = useSessionState(session);
  const player = props.player ?? silentPlayer;
  const preferences = useUnlockingPreferences(player);
  const drawer = useLogDrawer(state.phase);
  useSoundCues(session, player, preferences.sound);
  const coach = useCoach(session, state, offeredCoach(props, preferences));
  useFaceSwitch(session, preferences.face);
  const vm = state.phase === 'idle' ? null : toViewModel(state, humanSeat);
  const talk = useTalk(vm, drawer.dismiss);
  const { pause, autoNextMs } = useAdvance(props, state.phase === 'handOver' ? vm : null, {
    on: preferences.autoNext,
    logOpen: drawer.open,
  });
  if (vm === null) {
    return (
      <Start app={props} seed={state.seed} preferences={preferences} progress={state.loading} />
    );
  }
  const act = actWith(session, preferences);
  const layer = tableLayer({ session, state, vm, humanSeat, open: { drawer, talk, coach } });
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
          talk={talk}
          onMenu={pause.setMenuOpen}
        />
        <Table
          vm={vm}
          phase={state.phase}
          humanSeat={humanSeat}
          autoNextMs={autoNextMs}
          onAct={act}
          onNextHand={() => void session.getState().nextHand()}
          onWait={() => pause.wait(vm.handNumber)}
          onSay={(text) => session.getState().say(text)}
          onQuick={(id, text) => session.getState().quick(id, text)}
          coach={coach.panel}
          layer={layer.layer}
          layerKind={layer.kind}
          face={faceSlot(session, vm, preferences)}
        />
        <GameOver props={props} vm={vm} phase={state.phase} sessionId={state.sessionId} />
        {props.debugPanel !== undefined && <props.debugPanel session={session} />}
      </div>
    </Scene>
  );
}

function Start({
  app,
  seed,
  preferences,
  progress,
}: {
  app: AppProps;
  seed: number;
  preferences: UnlockingPreferences;
  progress: LoadProgress | null;
}) {
  return (
    <StartScreen
      seed={seed}
      simple={preferences.simple}
      face={preferences.face}
      onChoose={(opponent) => app.session.getState().prepare(opponent)}
      progress={progress}
      farewell={app.farewell ?? false}
      coach={preferences.coach}
      onToggleCoach={(app.features ?? ALL_FEATURES).coach ? preferences.toggleCoach : undefined}
      opponent={(app.features ?? ALL_FEATURES).opponents ? undefined : (app.opponent ?? 'math')}
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
  drawer: LogDrawer;
  preferences: Preferences;
  coach: CoachView;
  talk: Talk;
  onMenu: (open: boolean) => void;
}

function Header({ app, vm, seed, drawer, preferences, coach, talk, onMenu }: HeaderProps) {
  const phase = app.session.getState().phase;
  const features = app.features ?? ALL_FEATURES;
  return (
    <StatusBar
      vm={vm}
      logOpen={drawer.open}
      logToggle={drawer.toggle}
      onToggleLog={drawer.flip}
      coach={coach.toggle}
      talk={
        talk.available ? (
          <TalkButton open={talk.open} onToggle={talk.toggle} button={talk.button} />
        ) : null
      }
    >
      <HistoryMenu
        seed={seed}
        store={app.store}
        onNewGame={app.onNewGame}
        onOpen={() => {
          drawer.dismiss();
          onMenu(true);
        }}
        onClose={() => onMenu(false)}
      >
        <Settings
          preferences={preferences}
          offered={{ coach: features.coach, voice: features.talk }}
          {...conversationActions(app.session, vm)}
          conversation={features.talk && vm.conversation.available}
        />
        {vm.mode === 'cash' && (
          <button
            type="button"
            class="button menu-leave"
            data-testid="leave"
            disabled={phase !== 'handOver'}
            onClick={(event) => {
              const menu = (event.currentTarget as HTMLElement).closest('details');
              if (menu !== null) menu.open = false;
              app.session.getState().leave();
            }}
          >
            {t('status.leave')}
          </button>
        )}
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
        onLeave={props.onLeaveTonight}
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
