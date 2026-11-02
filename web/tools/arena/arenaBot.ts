import type { Action, EngineEvent, LegalActions } from '../../src/engine/index.ts';
import type { Observation } from '../../src/brains/index.ts';

export interface ArenaBot {
  observe(o: Observation): void;
  decide(legal: LegalActions): Action;
  events?(events: readonly EngineEvent[]): void;
  spoke?(): boolean;
  heard?(spoke: boolean): void;
  dispose?(): void;
}
