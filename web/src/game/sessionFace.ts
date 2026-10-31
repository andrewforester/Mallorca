import type { EngineEvent, SeatIndex } from '../engine/index.ts';
import { MALLORCA_LOOK, faceFrame, pulsesOf } from '../face/index.ts';
import type { FaceFrame, GazeTarget, Pulse } from '../face/index.ts';
import type { Talk } from '../talk/index.ts';
import { gazeOf } from './faceCues.ts';

export type FaceCue =
  | { id: number; kind: 'pulse'; pulse: Pulse }
  | { id: number; kind: 'gaze'; target: GazeTarget; then: GazeTarget | null };

export interface FaceState {
  on: boolean;
  cues: FaceCue[];
}

export interface FaceHost {
  read(): FaceState;
  write(face: FaceState): void;
  talk(): Talk | null;
  now(): number;
  botSeat: SeatIndex;
}

export interface SessionFace {
  observe(events: readonly EngineEvent[]): void;
  setOn(on: boolean): void;
  now(): FaceFrame | null;
}

type NewCue = FaceCue extends infer C ? (C extends FaceCue ? Omit<C, 'id'> : never) : never;

const MAX_CUES = 24;

export const initialFace = (on: boolean): FaceState => ({ on, cues: [] });

export function sessionFace(host: FaceHost): SessionFace {
  let nextId = 0;
  const frameOf = (talk: Talk): FaceFrame =>
    faceFrame(talk.feelingAt(host.now()), talk.stance(), MALLORCA_LOOK);
  const add = (fresh: NewCue[]): void => {
    if (fresh.length === 0) return;
    const face = host.read();
    const cues = fresh.map((cue) => ({ ...cue, id: (nextId += 1) }) as FaceCue);
    host.write({ ...face, cues: [...face.cues, ...cues].slice(-MAX_CUES) });
  };
  return {
    observe(events) {
      const talk = host.talk();
      if (talk === null) return;
      const impulses = talk.impulses();
      if (!host.read().on) return;
      const pulses = pulsesOf(impulses, frameOf(talk).mask, MALLORCA_LOOK);
      const gaze = gazeOf(events, host.botSeat);
      add([
        ...pulses.map((pulse): NewCue => ({ kind: 'pulse', pulse })),
        ...(gaze === null ? [] : [{ kind: 'gaze', ...gaze } as NewCue]),
      ]);
    },
    setOn(on) {
      host.talk()?.impulses();
      host.write({ ...host.read(), on });
    },
    now() {
      const talk = host.talk();
      return talk === null || !host.read().on ? null : frameOf(talk);
    },
  };
}
