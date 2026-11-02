import type { CfrBrain } from '../../src/cfr/index.ts';
import type { EngineEvent, SeatIndex } from '../../src/engine/index.ts';
import type { Persona } from '../../src/persona/index.ts';
import type { ArenaBot } from './arenaBot.ts';

export const HAND_GAP_MS = 8000;
export const ACTION_MS = 6000;

function elapsed(events: readonly EngineEvent[]): number {
  let ms = 0;
  for (const e of events) {
    if (e.type === 'handStarted') ms += HAND_GAP_MS;
    if (e.type === 'acted') ms += ACTION_MS;
  }
  return ms;
}

function opponentActed(events: readonly EngineEvent[], seat: SeatIndex): boolean {
  const acted = events.some((e) => e.type === 'acted' && e.seat !== seat);
  return acted && !events.some((e) => e.type === 'handEnded');
}

export function createPersonaBot(brain: CfrBrain, persona: Persona, seat: SeatIndex): ArenaBot {
  let now = 0;
  return {
    observe: (o) => brain.observe(o),
    events(events) {
      now += elapsed(events);
      persona.observe(events, now);
      const range = brain.opponentRange();
      if (range !== null && opponentActed(events, seat)) {
        persona.narrow(range, persona.view(now).hand.handNumber);
      }
    },
    decide(legal) {
      brain.setBias(persona.view(now).bias);
      return brain.decide(legal).action;
    },
    dispose: () => brain.dispose(),
  };
}
