import { mulberry32 } from '../cards/index.ts';
import type { EngineEvent, SeatIndex } from '../engine/index.ts';
import type { BotClient } from './botClient.ts';
import { createProbe } from './debug.ts';
import type { DebugProbe, DebugState } from './debug.ts';
import type { Opponent } from './opponent.ts';
import { sessionFace } from './sessionFace.ts';
import type { SessionFace } from './sessionFace.ts';
import { sessionConversation } from './sessionConversation.ts';
import type { SessionConversation } from './sessionConversation.ts';
import { sessionPersona } from './sessionPersona.ts';
import type { SessionPersona } from './sessionPersona.ts';
import type { SessionOptions, SessionState } from './sessionTypes.ts';
import { silentConversationClient } from './conversationClient.ts';
import { createTrace } from './conversationTrace.ts';
import type { TraceSink } from './conversationTrace.ts';

export interface WiringHost {
  bot(): BotClient;
  get(): SessionState;
  set(patch: Partial<SessionState>): void;
  epoch(): number;
  seed(): number;
  felt(): void;
}

export interface Her {
  persona: SessionPersona;
  conversation: SessionConversation;
  face: SessionFace;
  probe: DebugProbe | null;
  trace: TraceSink | null;
  opponent: Opponent;
  seed: number;
}

const SPEECH_SALT = 0x7a1c;
const SEED_RANGE = 0x100000000;

export function beginHer(her: Her): void {
  const speech = mulberry32(her.seed ^ SPEECH_SALT);
  const own = mulberry32(Math.floor(speech.next() * SEED_RANGE));
  her.persona.begin(her.opponent, own);
  her.conversation.begin(her.opponent, speech);
  her.probe?.refresh();
}

export function observeHer(her: Her, events: readonly EngineEvent[]): void {
  const moments = her.persona.observe(events);
  her.conversation.observe(events, moments);
  her.face.observe(events);
  her.probe?.observed();
}

export function wireHer(
  host: WiringHost,
  options: SessionOptions,
  botSeat: SeatIndex,
): Pick<Her, 'persona' | 'conversation' | 'face' | 'trace'> {
  const persona = wirePersona(host, options, botSeat);
  const traced = import.meta.env.DEV && options.debug === true;
  const trace = traced ? createTrace(() => host.felt()) : null;
  const conversation = wireConversation(host, options, botSeat, { persona, trace });
  return { persona, conversation, face: wireFace(host, persona, options, botSeat), trace };
}

function wirePersona(
  host: WiringHost,
  options: SessionOptions,
  botSeat: SeatIndex,
): SessionPersona {
  return sessionPersona({
    botSeat,
    now: options.now ?? Date.now,
    epoch: () => host.epoch(),
    handNumber: () => host.get().table.handNumber,
    playerRange: () => host.bot().opponentRange?.() ?? Promise.resolve(null),
  });
}

function wireConversation(
  host: WiringHost,
  options: SessionOptions,
  botSeat: SeatIndex,
  her: { persona: SessionPersona; trace: TraceSink | null },
): SessionConversation {
  const { persona, trace } = her;
  return sessionConversation(
    {
      client: options.conversation ?? silentConversationClient,
      now: options.now ?? Date.now,
      locale: options.locale ?? 'en',
      botSeat,
      connect: options.connectConversation,
      trace: trace ?? undefined,
    },
    {
      read: () => host.get().conversation,
      write: (conversation) => host.set({ conversation }),
      table: () => host.get().table,
      epoch: () => host.epoch(),
      sessionId: () => host.get().sessionId ?? `seed-${host.seed()}`,
      her: () => persona.current(),
      hear: (signals) => {
        persona.hear(signals);
        host.felt();
      },
    },
  );
}

function wireFace(
  host: WiringHost,
  persona: SessionPersona,
  options: SessionOptions,
  botSeat: SeatIndex,
): SessionFace {
  return sessionFace({
    read: () => host.get().face,
    write: (face) => host.set({ face }),
    persona: () => persona.current(),
    now: options.now ?? Date.now,
    botSeat,
  });
}

export function wireProbe(
  her: Pick<Her, 'persona' | 'trace'>,
  options: SessionOptions,
  write: (state: DebugState) => void,
): DebugProbe | null {
  if (!import.meta.env.DEV || options.debug !== true) {
    return null;
  }
  return createProbe(her.persona, options.now ?? Date.now, write, her.trace);
}
