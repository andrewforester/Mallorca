import type { EngineEvent, SeatIndex } from '../engine/index.ts';
import { MALLORCA_LOOK, faceFrame, pulsesOf } from '../face/index.ts';
import type { FaceFrame, GazeTarget, Pulse } from '../face/index.ts';
import type { Impulse, Persona } from '../persona/index.ts';
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
  persona(): Persona | null;
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
  let seen: Persona | null = null;
  let cursor = 0;
  const frameOf = (persona: Persona): FaceFrame => {
    const view = persona.view(host.now());
    return faceFrame(view.snapshot, view.presenting, MALLORCA_LOOK);
  };
  const fresh = (persona: Persona): Impulse[] => {
    const from = persona === seen ? cursor : 0;
    seen = persona;
    cursor = persona.lastJournalId();
    return persona.journalSince(from).flatMap((entry) => entry.impulses);
  };
  const add = (cues: NewCue[]): void => {
    if (cues.length === 0) return;
    const face = host.read();
    const numbered = cues.map((cue) => ({ ...cue, id: (nextId += 1) }) as FaceCue);
    host.write({ ...face, cues: [...face.cues, ...numbered].slice(-MAX_CUES) });
  };
  return {
    observe(events) {
      const persona = host.persona();
      if (persona === null) return;
      const impulses = fresh(persona);
      if (!host.read().on) return;
      const pulses = pulsesOf(impulses, frameOf(persona).mask, MALLORCA_LOOK);
      const gaze = gazeOf(events, host.botSeat);
      add([
        ...pulses.map((pulse): NewCue => ({ kind: 'pulse', pulse })),
        ...(gaze === null ? [] : [{ kind: 'gaze', ...gaze } as NewCue]),
      ]);
    },
    setOn(on) {
      const persona = host.persona();
      if (persona !== null) fresh(persona);
      host.write({ ...host.read(), on });
    },
    now() {
      const persona = host.persona();
      return persona === null || !host.read().on ? null : frameOf(persona);
    },
  };
}
