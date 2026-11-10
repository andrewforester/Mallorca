import type { EngineEvent, SeatIndex, Table } from '../engine/index.ts';

export const RUNOUT_MS = 1200;

export interface RunoutStage {
  table: Table;
  events: EngineEvent[];
}

export interface Runout {
  stages: RunoutStage[];
  tail: EngineEvent[];
}

export interface RunoutHost {
  show(stage: RunoutStage, first: boolean): void;
  wait(): Promise<boolean>;
}

type Dealt = Extract<EngineEvent, { type: 'streetDealt' }>;

function paidBack(events: EngineEvent[], seat: SeatIndex): number {
  let total = 0;
  for (const event of events) {
    if ((event.type === 'potAwarded' || event.type === 'betReturned') && event.seat === seat) {
      total += event.amount;
    }
  }
  return total;
}

function tableAt(final: Table, dealt: Dealt, tail: EngineEvent[]): Table {
  const { hand, seats } = final;
  if (hand === null) {
    return final;
  }
  return {
    ...final,
    winner: null,
    seats: [
      { ...seats[0], stack: seats[0].stack - paidBack(tail, 0) },
      { ...seats[1], stack: seats[1].stack - paidBack(tail, 1) },
    ],
    hand: {
      ...hand,
      street: 'showdown',
      board: dealt.board,
      pot: dealt.pot,
      bets: [0, 0],
      toAct: null,
    },
  };
}

export function runoutOf(step: { state: Table; events: EngineEvent[] }): Runout | null {
  const end = step.events.findIndex((event) => event.type === 'showdown');
  if (step.state.hand?.street !== 'complete' || end < 0) {
    return null;
  }
  const tail = step.events.slice(end);
  const stages: RunoutStage[] = [];
  let from = 0;
  step.events.slice(0, end).forEach((event, index) => {
    if (event.type === 'streetDealt') {
      const events = step.events.slice(from, index + 1);
      stages.push({ table: tableAt(step.state, event, tail), events });
      from = index + 1;
    }
  });
  return stages.length === 0 ? null : { stages, tail };
}

export async function stageRunout(runout: Runout, host: RunoutHost): Promise<boolean> {
  for (const [index, stage] of runout.stages.entries()) {
    host.show(stage, index === 0);
    if (!(await host.wait())) {
      return false;
    }
  }
  return true;
}
