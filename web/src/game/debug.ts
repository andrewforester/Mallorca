import type { Decision } from '../brains/index.ts';
import { coachMove } from '../coach/index.ts';
import type { CoachMove } from '../coach/index.ts';
import type { Card } from '../cards/index.ts';
import type { Action, LegalActions, SeatIndex, Table } from '../engine/index.ts';
import { PERSONALITIES } from '../talk/index.ts';
import type { JournalEntry, Personality, PersonalityKey, Snapshot, Style } from '../talk/index.ts';
import type { SessionTalk } from './sessionTalk.ts';

export type PersonalityChoice =
  { key: PersonalityKey } | { key: 'custom'; personality: Personality };

export interface DecisionRow {
  move: CoachMove;
  base: number;
  styled: number;
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
  sentStyle: Style | null;
  decision: DebugDecision | null;
  journal: JournalEntry[];
}

export interface Decided {
  decision: Decision | null;
  style: Style | undefined;
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
    styled: breakdown.biased[k] ?? 0,
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

export function createProbe(talk: SessionTalk, write: (state: DebugState) => void): DebugProbe {
  let state: DebugState = {
    personality: { key: 'mallorca' },
    snapshot: null,
    sentStyle: null,
    decision: null,
    journal: [],
  };
  const refresh = () => {
    const felt = talk.feeling();
    state = { ...state, snapshot: felt?.snapshot ?? null, journal: felt?.journal ?? [] };
    write(state);
  };
  return {
    initial: () => state,
    refresh,
    decided(played) {
      state = {
        ...state,
        sentStyle: played.style ?? null,
        decision: shownOf(played) ?? state.decision,
      };
      refresh();
    },
    choose(choice) {
      const personality = choiceOf(choice);
      state = { ...state, personality };
      talk.setPersonality(personalityOf(personality));
      refresh();
    },
    reset() {
      talk.resetFeeling();
      refresh();
    },
  };
}
