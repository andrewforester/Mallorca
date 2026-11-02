import { render } from 'preact';
import {
  createSession,
  onPageExit,
  openHandStore,
  conversationConnector,
  TOURNAMENT,
  workerBot,
} from './game/index.ts';
import type { Session } from './game/index.ts';
import { App } from './ui/App.tsx';
import { createSynthPlayer } from './ui/sound/player.ts';
import { t } from './ui/i18n.ts';
import { readFace, readConversation, readTells } from './ui/preferences.ts';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './ui/styles/tokens.css';
import './ui/styles/layout.css';

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
const connectConversation = conversationConnector({
  url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
});

onPageExit(window, document, () => session?.getState().pageHidden());

const debugPanel = import.meta.env.DEV
  ? (await import('./ui/debug/EmotionDebug.tsx')).EmotionDebug
  : undefined;

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app element');
}

function mount(farewell = false): void {
  session?.getState().dispose();
  const seed = nextSeed ?? randomSeed();
  nextSeed = null;
  session = createSession({
    bot: workerBot(),
    seed,
    botDelayMs: botDelay,
    humanSeat: HUMAN_SEAT,
    names: [t('seat.you'), t('seat.bot')],
    mode: TOURNAMENT,
    connectConversation,
    conversationOn: readConversation(),
    tells: readTells(),
    faceOn: readFace(),
    debug: import.meta.env.DEV,
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
      onNewGame={() => mount()}
      onLeaveTonight={() => mount(true)}
    />,
    root as HTMLElement,
  );
}

mount();
