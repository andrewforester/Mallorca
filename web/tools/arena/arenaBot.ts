import type { Action, EngineEvent, LegalActions, SeatIndex } from '../../src/engine/index.ts';
import type { Brain, Observation } from '../../src/brains/index.ts';
import type { Rng } from '../../src/cards/index.ts';

export interface ArenaBot {
  observe(o: Observation): void;
  decide(legal: LegalActions): Action;
  events?(events: readonly EngineEvent[]): void;
  spoke?(): boolean;
  heard?(spoke: boolean): void;
  dispose?(): void;
}

export type BotFactory = (rng: Rng, seat: SeatIndex) => ArenaBot;

export function fromBrain(brain: Brain): ArenaBot {
  return {
    observe: (o) => brain.observe(o),
    decide: (legal) => brain.decide(legal).action,
    dispose: () => brain.dispose?.(),
  };
}
