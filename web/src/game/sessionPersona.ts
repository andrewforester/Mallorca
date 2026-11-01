import type { Rng } from '../cards/index.ts';
import type { EngineEvent, SeatIndex } from '../engine/index.ts';
import { createPersona } from '../persona/index.ts';
import type { Bias, Moment, Persona, Personality, Signal } from '../persona/index.ts';
import type { Opponent } from './opponent.ts';

export interface PersonaHost {
  botSeat: SeatIndex;
  now(): number;
  epoch(): number;
  handNumber(): number;
  playerRange(): Promise<Float32Array | null>;
}

export interface SessionPersona {
  begin(opponent: Opponent, rng: Rng): void;
  observe(events: readonly EngineEvent[]): Moment[];
  hear(signals: readonly Signal[]): void;
  current(): Persona | null;
  bias(): Bias | undefined;
  setPersonality(p: Personality): void;
  reset(): void;
}

function attempt<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return call().catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

class Her implements SessionPersona {
  private persona: Persona | null = null;
  private solver = false;
  private personality: Personality | null = null;
  private rangeAsks = 0;
  private readonly host: PersonaHost;

  constructor(host: PersonaHost) {
    this.host = host;
  }

  begin(opponent: Opponent, rng: Rng): void {
    const personality = this.personality ?? undefined;
    this.persona = createPersona({ seat: this.host.botSeat, rng, personality });
    this.solver = opponent !== 'math';
  }

  observe(events: readonly EngineEvent[]): Moment[] {
    const persona = this.persona;
    if (persona === null) {
      return [];
    }
    const moments = persona.observe(events, this.host.now());
    if (this.solver && this.playerActed(events)) {
      this.askRange(persona);
    }
    return moments;
  }

  hear(signals: readonly Signal[]): void {
    this.persona?.hear(signals);
  }

  current(): Persona | null {
    return this.persona;
  }

  bias(): Bias | undefined {
    return this.solver ? this.persona?.view(this.host.now()).bias : undefined;
  }

  setPersonality(p: Personality): void {
    this.personality = p;
    this.persona?.setPersonality(p);
  }

  reset(): void {
    this.persona?.reset();
  }

  private playerActed(events: readonly EngineEvent[]): boolean {
    const acted = events.some((e) => e.type === 'acted' && e.seat !== this.host.botSeat);
    return acted && !events.some((e) => e.type === 'handEnded');
  }

  private askRange(persona: Persona): void {
    this.rangeAsks += 1;
    const mine = this.rangeAsks;
    const epoch = this.host.epoch();
    const handNumber = this.host.handNumber();
    const current = () =>
      mine === this.rangeAsks && epoch === this.host.epoch() && persona === this.persona;
    setTimeout(() => {
      if (!current()) {
        return;
      }
      void attempt(() => this.host.playerRange()).then((range) => {
        if (range !== null && current()) {
          persona.narrow(range, handNumber);
        }
      });
    }, 0);
  }
}

export function sessionPersona(host: PersonaHost): SessionPersona {
  return new Her(host);
}
