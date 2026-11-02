import type { Decision } from '../brains/index.ts';
import { coachMove } from '../coach/index.ts';
import type { CoachMove } from '../coach/index.ts';
import type { Card } from '../cards/index.ts';
import type { Action, LegalActions, SeatIndex, Table } from '../engine/index.ts';
import { PERSONALITIES } from '../persona/index.ts';
import type {
  JournalEntry,
  Personality,
  PersonalityKey,
  Snapshot,
  Bias,
} from '../persona/index.ts';
import type { SessionPersona } from './sessionPersona.ts';
import { EMPTY_TRACE } from './conversationTrace.ts';
import type { ConversationTrace, TraceSink } from './conversationTrace.ts';

export type PersonalityChoice =
  { key: PersonalityKey } | { key: 'custom'; personality: Personality };

export interface DecisionRow {
  move: CoachMove;
  base: number;
  biased: number;
  chosen: boolean;
}

export interface DebugDecision {
  hand: [Card, Card] | null;
  board: Card[];
  rows: DecisionRow[];
  action: CoachMove;
}

export interface DebugEntry extends JournalEntry {
  spoke: boolean;
}

export interface DebugState {
  personality: PersonalityChoice;
  snapshot: Snapshot | null;
  sentBias: Bias | null;
  decision: DebugDecision | null;
  journal: DebugEntry[];
  conversation: ConversationTrace;
}

export interface Decided {
  decision: Decision | null;
  bias: Bias | undefined;
  action: Action;
  legal: LegalActions;
  table: Table;
  seat: SeatIndex;
}

export interface DebugProbe {
  initial(): DebugState;
  refresh(): void;
  observed(): void;
  decided(played: Decided): void;
  choose(choice: PersonalityKey | Personality): void;
  reset(): void;
}

function choiceOf(choice: PersonalityKey | Personality): PersonalityChoice {
  return typeof choice === 'string' ? { key: choice } : { key: 'custom', personality: choice };
}

function shownOf({ decision, action, legal, table, seat }: Decided): DebugDecision | null {
  const breakdown = decision?.breakdown;
  const hand = table.hand;
  if (breakdown === undefined || hand === null) {
    return null;
  }
  const rows = breakdown.moves.map((move, k) => ({
    move: coachMove(move, legal, hand.pot),
    base: breakdown.base[k] ?? 0,
    biased: breakdown.biased[k] ?? 0,
    chosen: k === breakdown.chosen,
  }));
  return {
    hand: hand.holeCards[seat],
    board: [...hand.board],
    rows,
    action: coachMove(action, legal, hand.pot),
  };
}

export function personalityOf(choice: PersonalityChoice): Personality {
  return choice.key === 'custom' ? choice.personality : PERSONALITIES[choice.key];
}

function spokenIds(trace: ConversationTrace): Set<number> {
  const planned = trace.entries.filter((e) => e.plan !== null);
  return new Set(planned.flatMap((e) => e.verdict.occasion.journalIds));
}

export function createProbe(
  her: SessionPersona,
  now: () => number,
  write: (state: DebugState) => void,
  trace: TraceSink | null,
): DebugProbe {
  let state: DebugState = {
    personality: { key: 'mallorca' },
    snapshot: null,
    sentBias: null,
    decision: null,
    journal: [],
    conversation: trace?.read() ?? EMPTY_TRACE,
  };
  const refresh = () => {
    const persona = her.current();
    const conversation = trace?.read() ?? EMPTY_TRACE;
    const spoken = spokenIds(conversation);
    const snapshot = persona?.view(now()).snapshot ?? null;
    const journal = (persona?.journal() ?? []).map((e) => ({ ...e, spoke: spoken.has(e.id) }));
    state = { ...state, snapshot, journal, conversation };
    write(state);
  };
  return {
    initial: () => state,
    refresh,
    observed: refresh,
    decided(played) {
      state = {
        ...state,
        sentBias: played.bias ?? null,
        decision: shownOf(played) ?? state.decision,
      };
      refresh();
    },
    choose(choice) {
      const personality = choiceOf(choice);
      state = { ...state, personality };
      her.setPersonality(personalityOf(personality));
      refresh();
    },
    reset() {
      her.reset();
      refresh();
    },
  };
}
