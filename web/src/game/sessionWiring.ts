import type { SeatIndex } from '../engine/index.ts';
import type { BotClient } from './botClient.ts';
import { sessionFace } from './sessionFace.ts';
import type { SessionFace } from './sessionFace.ts';
import { sessionTalk } from './sessionTalk.ts';
import type { SessionTalk } from './sessionTalk.ts';
import type { SessionOptions, SessionState } from './sessionTypes.ts';
import { silentTalkClient } from './talkClient.ts';

export interface WiringHost {
  bot(): BotClient;
  get(): SessionState;
  set(patch: Partial<SessionState>): void;
  epoch(): number;
  seed(): number;
}

export function wireTalk(
  host: WiringHost,
  options: SessionOptions,
  botSeat: SeatIndex,
): SessionTalk {
  return sessionTalk(
    {
      client: options.talk ?? silentTalkClient,
      now: options.now ?? Date.now,
      locale: options.locale ?? 'en',
      botSeat,
      connect: options.connectTalk,
      playerRange: () => host.bot().opponentRange?.() ?? Promise.resolve(null),
    },
    {
      read: () => host.get().talk,
      write: (talk) => host.set({ talk }),
      table: () => host.get().table,
      epoch: () => host.epoch(),
      sessionId: () => host.get().sessionId ?? `seed-${host.seed()}`,
    },
  );
}

export function wireFace(
  host: WiringHost,
  talk: SessionTalk,
  options: SessionOptions,
  botSeat: SeatIndex,
): SessionFace {
  return sessionFace({
    read: () => host.get().face,
    write: (face) => host.set({ face }),
    talk: () => talk.active(),
    now: options.now ?? Date.now,
    botSeat,
  });
}
