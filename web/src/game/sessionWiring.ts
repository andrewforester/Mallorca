import { mulberry32 } from '../cards/index.ts';
import type { EngineEvent, SeatIndex } from '../engine/index.ts';
import type { BotClient } from './botClient.ts';
import type { DebugProbe } from './debug.ts';
import type { Opponent } from './opponent.ts';
import { sessionFace } from './sessionFace.ts';
import type { SessionFace } from './sessionFace.ts';
import { sessionConversation } from './sessionConversation.ts';
import type { SessionConversation } from './sessionConversation.ts';
import { sessionPersona } from './sessionPersona.ts';
import type { SessionPersona } from './sessionPersona.ts';
import type { SessionOptions, SessionState } from './sessionTypes.ts';
import { silentConversationClient } from './conversationClient.ts';

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
  const from = her.persona.current()?.lastJournalId() ?? 0;
  const moments = her.persona.observe(events);
  const spoke = her.conversation.observe(events, moments);
  her.face.observe(events);
  her.probe?.observed(from, spoke);
}

export function wireHer(
  host: WiringHost,
  options: SessionOptions,
  botSeat: SeatIndex,
): Pick<Her, 'persona' | 'conversation' | 'face'> {
  const persona = wirePersona(host, options, botSeat);
  const conversation = wireConversation(host, options, botSeat, persona);
  return { persona, conversation, face: wireFace(host, persona, options, botSeat) };
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
  persona: SessionPersona,
): SessionConversation {
  return sessionConversation(
    {
      client: options.conversation ?? silentConversationClient,
      now: options.now ?? Date.now,
      locale: options.locale ?? 'en',
      botSeat,
      connect: options.connectConversation,
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
