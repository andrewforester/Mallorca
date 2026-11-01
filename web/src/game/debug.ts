import type { Decision } from '../brains/index.ts';
import { coachMove } from '../coach/index.ts';
import type { CoachMove } from '../coach/index.ts';
import type { Card } from '../cards/index.ts';
import type { Action, LegalActions, SeatIndex, Table } from '../engine/index.ts';
import { PERSONALITIES } from '../conversation/index.ts';
import type {
  JournalEntry,
  Personality,
  PersonalityKey,
  Snapshot,
  Bias,
} from '../conversation/index.ts';
import type { SessionConversation } from './sessionConversation.ts';

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

export interface DebugState {
  personality: PersonalityChoice;
  snapshot: Snapshot | null;
  sentBias: Bias | null;
  decision: DebugDecision | null;
  journal: JournalEntry[];
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

export function createProbe(
  conversation: SessionConversation,
  write: (state: DebugState) => void,
): DebugProbe {
  let state: DebugState = {
    personality: { key: 'mallorca' },
    snapshot: null,
    sentBias: null,
    decision: null,
    journal: [],
  };
  const refresh = () => {
    const felt = conversation.feeling();
    state = { ...state, snapshot: felt?.snapshot ?? null, journal: felt?.journal ?? [] };
    write(state);
  };
  return {
    initial: () => state,
    refresh,
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
      conversation.setPersonality(personalityOf(personality));
      refresh();
    },
    reset() {
      conversation.resetFeeling();
      refresh();
    },
  };
}
