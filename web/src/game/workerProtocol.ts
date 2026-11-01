import type { BotBias, Decision, Observation } from '../brains/index.ts';
import type { CoachFacts } from '../coach/index.ts';
import type { LegalActions } from '../engine/index.ts';
import type { Opponent } from './opponent.ts';

export type WorkerRequest =
  | { kind: 'reset' }
  | { kind: 'observe'; observations: Observation[] }
  | { kind: 'decide'; id: number; legal: LegalActions; style?: BotBias; explain?: boolean }
  | { kind: 'select'; id: number; opponent: Opponent; seed: number }
  | { kind: 'coach'; id: number; observations: Observation[]; legal: LegalActions; pot: number }
  | { kind: 'opponentRange'; id: number };

export type WorkerReply =
  | { id: number; decision: Decision }
  | { id: number; opponent: Opponent }
  | { id: number; facts: CoachFacts }
  | { id: number; range: Float32Array | null }
  | { id: number; error: string };
