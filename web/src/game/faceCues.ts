import type { EngineEvent, SeatIndex } from '../engine/index.ts';
import type { GazeTarget } from '../face/index.ts';

export interface Gaze {
  target: GazeTarget;
  then: GazeTarget | null;
}

const look = (target: GazeTarget, then: GazeTarget | null = null): Gaze => ({ target, then });

function gazeAt(event: EngineEvent, botSeat: SeatIndex): Gaze | null {
  switch (event.type) {
    case 'holeCards':
      return event.seat === botSeat ? look('cards') : null;
    case 'streetDealt':
      return look('board');
    case 'acted': {
      const kind = event.action.kind;
      const paid = kind === 'call' || kind === 'raise';
      return event.seat === botSeat && paid ? look('chips', 'player') : look('player');
    }
    case 'handEnded':
      return look('player');
    default:
      return null;
  }
}

export function gazeOf(events: readonly EngineEvent[], botSeat: SeatIndex): Gaze | null {
  let gaze: Gaze | null = null;
  for (const event of events) {
    gaze = gazeAt(event, botSeat) ?? gaze;
  }
  return gaze;
}
