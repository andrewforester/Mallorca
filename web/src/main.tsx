import { render } from 'preact';
import {
  createSession,
  onPageExit,
  openHandStore,
  conversationConnector,
  TOURNAMENT,
  sharedWorkerBot,
} from './game/index.ts';
import type { Session } from './game/index.ts';
import { App } from './ui/App.tsx';
import { readFeatures, releaseOpponent } from './ui/features.ts';
import { createSynthPlayer } from './ui/sound/player.ts';
import { t } from './ui/i18n.ts';
import { readCharacter, readConversation, readFace, writeCharacter } from './ui/preferences.ts';
import '@fontsource/newsreader/latin-400.css';
import '@fontsource/newsreader/latin-400-italic.css';
import '@fontsource/newsreader/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/start.css';
import './ui/styles/status.css';
import './ui/styles/table.css';
import './ui/styles/actions.css';
import './ui/styles/dialog.css';
import './ui/styles/table-wide.css';
import './ui/styles/table-phone.css';
import './ui/styles/scene.css';
import './ui/styles/hand-log.css';
import './ui/styles/talk.css';
import './ui/styles/coach.css';
import './ui/styles/face.css';

const HUMAN_SEAT = 0;
const DEFAULT_BOT_DELAY = 700;

const params = new URLSearchParams(window.location.search);

function numberParam(name: string): number | null {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

const botDelay = numberParam('botDelay') ?? DEFAULT_BOT_DELAY;
const autoNext = params.get('autoNext') !== 'off';
const player = createSynthPlayer();
let nextSeed: number | null = numberParam('seed');
let session: Session | null = null;
const store = await openHandStore();
const features = readFeatures(window.location.search);
const opponent = releaseOpponent(
  window.location.search,
  globalThis.matchMedia?.('(pointer: fine)').matches ?? true,
);
const connectConversation = features.talk
  ? conversationConnector({
      url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
    })
  : undefined;

onPageExit(window, document, () => session?.getState().pageHidden());

const debugOn = import.meta.env.DEV || params.has('debug');
const debugPanel = debugOn ? (await import('./ui/debug/EmotionDebug.tsx')).EmotionDebug : undefined;

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app element');
}

const nextBot = sharedWorkerBot();

function mount(farewell = false, character = readCharacter()): void {
  session?.getState().dispose();
  const seed = nextSeed ?? randomSeed();
  nextSeed = null;
  session = createSession({
    bot: nextBot(),
    seed,
    botDelayMs: botDelay,
    humanSeat: HUMAN_SEAT,
    names: [t('seat.you'), t(`start.characters.${character}.name`)],
    personality: character,
    mode: TOURNAMENT,
    connectConversation,
    conversationOn: features.talk && readConversation(),
    faceOn: readFace(),
    debug: debugOn,
    records: {
      store,
      sessionId: crypto.randomUUID(),
      now: () => new Date().toISOString(),
    },
  });
  render(
    <App
      session={session}
      store={store}
      humanSeat={HUMAN_SEAT}
      farewell={farewell}
      autoNext={autoNext}
      player={player}
      debugPanel={debugPanel}
      features={features}
      opponent={opponent}
      character={character}
      onCharacter={(next) => {
        writeCharacter(next);
        mount(farewell, next);
      }}
      onNewGame={() => mount()}
      onLeaveTonight={() => mount(true)}
    />,
    root as HTMLElement,
  );
}

mount();
