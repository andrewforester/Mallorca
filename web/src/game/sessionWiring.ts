import type { SeatIndex } from '../engine/index.ts';
import type { BotClient } from './botClient.ts';
import { sessionFace } from './sessionFace.ts';
import type { SessionFace } from './sessionFace.ts';
import { sessionConversation } from './sessionConversation.ts';
import type { SessionConversation } from './sessionConversation.ts';
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

export function wireConversation(
  host: WiringHost,
  options: SessionOptions,
  botSeat: SeatIndex,
): SessionConversation {
  return sessionConversation(
    {
      client: options.conversation ?? silentConversationClient,
      now: options.now ?? Date.now,
      locale: options.locale ?? 'en',
      botSeat,
      connect: options.connectConversation,
      playerRange: () => host.bot().opponentRange?.() ?? Promise.resolve(null),
    },
    {
      read: () => host.get().conversation,
      write: (conversation) => host.set({ conversation }),
      table: () => host.get().table,
      epoch: () => host.epoch(),
      sessionId: () => host.get().sessionId ?? `seed-${host.seed()}`,
      felt: () => host.felt(),
    },
  );
}

export function wireFace(
  host: WiringHost,
  conversation: SessionConversation,
  options: SessionOptions,
  botSeat: SeatIndex,
): SessionFace {
  return sessionFace({
    read: () => host.get().face,
    write: (face) => host.set({ face }),
    conversation: () => conversation.active(),
    now: options.now ?? Date.now,
    botSeat,
  });
}
