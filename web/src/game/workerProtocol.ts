import type { BotStyle, Decision, Observation } from '../brains/index.ts';
import type { LegalActions } from '../engine/index.ts';
import type { Opponent } from './opponent.ts';

export type WorkerRequest =
  | { kind: 'reset' }
  | { kind: 'observe'; observations: Observation[] }
  | { kind: 'decide'; id: number; legal: LegalActions; style?: BotStyle }
  | { kind: 'select'; id: number; opponent: Opponent; seed: number };

export type WorkerReply =
  | { id: number; decision: Decision }
  | { id: number; opponent: Opponent }
  | { id: number; error: string };
