import type {
  FaceCue,
  FaceFrame,
  GazeTarget,
  Pulse,
  VisemeCue,
  Weights,
} from '../../game/index.ts';

export type Angles = [number, number, number];

export interface Pose {
  weights: Weights;
  eyes: [number, number];
  head: Angles;
  neck: Angles;
  spine: Angles;
  shoulder: number;
}

export interface MotionOptions {
  random: () => number;
  calm: boolean;
}

const GAZE: Readonly<Record<GazeTarget, readonly [number, number]>> = {
  player: [0, 0],
  cards: [0.02, 0.42],
  board: [0, 0.3],
  chips: [-0.32, 0.36],
  away: [0.45, 0.04],
  think: [-0.3, -0.22],
  down: [0.05, 0.5],
};

const GLANCES: readonly GazeTarget[] = ['cards', 'chips', 'away', 'board'];
const BACK_AFTER_S = 0.9;

interface Timed {
  pulse: Pulse;
  t0: number;
}

export function envelope(t: number, attack: number, hold: number, release: number): number {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  if (t < attack + hold) return 1;
  return t < attack + hold + release ? 1 - (t - attack - hold) / release : -1;
}

const ease = (cur: number, target: number, rate: number, dt: number): number =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

const clamp = (v: number, low: number, high: number): number => Math.max(low, Math.min(high, v));

const add = (w: Weights, name: string, v: number): void => {
  w[name] = (w[name] ?? 0) + v;
};

export class Motion {
  private readonly random: () => number;
  private readonly calm: boolean;
  private frame: FaceFrame | null = null;
  private values: Weights = {};
  private pulses: Timed[] = [];
  private blinks: number[] = [];
  private speech: VisemeCue[] = [];
  private speechStart = 0;
  private time = 0;
  private gaze: GazeTarget = 'player';
  private back: { target: GazeTarget; at: number } | null = null;
  private glance: { target: GazeTarget; until: number } | null = null;
  private thinking = false;
  private offset: [number, number] = [0, 0];
  private eyes: [number, number] = [0, 0];
  private head: Angles = [0, 0, 0];
  private nextBlink = 1.5;
  private nextSaccade = 0;

  constructor(options: MotionOptions) {
    this.random = options.random;
    this.calm = options.calm;
  }

  setFrame(frame: FaceFrame | null): void {
    this.frame = frame;
  }

  setThinking(thinking: boolean): void {
    this.thinking = thinking;
  }

  cue(cue: FaceCue): void {
    if (cue.kind === 'gaze') {
      this.gaze = cue.target;
      this.glance = null;
      this.back = cue.then === null ? null : { target: cue.then, at: this.time + BACK_AFTER_S };
      return;
    }
    this.pulses.push({ pulse: cue.pulse, t0: this.time + cue.pulse.delay });
    for (let i = 0; i < cue.pulse.blinks; i += 1) {
      this.blinks.push(this.time + cue.pulse.delay + i * 0.28);
    }
  }

  speak(cues: VisemeCue[]): void {
    this.speech = cues;
    this.speechStart = this.time;
  }

  sync(charIndex: number): void {
    const cue = this.speech.find((c) => c.charIndex >= charIndex);
    if (cue) this.speechStart = this.time - cue.at;
  }

  silence(): void {
    this.speech = [];
  }

  tick(dt: number): Pose {
    this.time += dt;
    this.idle();
    const weights = this.expression(dt);
    this.addSpeech(weights);
    const eyes = this.look(dt, weights);
    const blink = this.blink();
    weights.eyeBlinkLeft = Math.max(weights.eyeBlinkLeft ?? 0, blink);
    weights.eyeBlinkRight = Math.max(weights.eyeBlinkRight ?? 0, blink);
    for (const name of Object.keys(weights)) {
      weights[name] = clamp(weights[name] ?? 0, 0, 1);
    }
    return { weights, eyes, ...this.body(dt) };
  }

  private expression(dt: number): Weights {
    const target = this.frame?.weights ?? {};
    const out: Weights = {};
    for (const name of new Set([...Object.keys(this.values), ...Object.keys(target)])) {
      this.values[name] = ease(this.values[name] ?? 0, clamp(target[name] ?? 0, 0, 1), 3.2, dt);
      out[name] = this.values[name];
    }
    this.pulses = this.pulses.filter(({ pulse, t0 }) => {
      const e = envelope(this.time - t0, pulse.attack, pulse.hold, pulse.release);
      for (const [name, v] of Object.entries(pulse.weights)) {
        add(out, name, v * pulse.amp * Math.max(0, e));
      }
      return e >= 0;
    });
    return out;
  }

  private addSpeech(w: Weights): void {
    const t = this.time - this.speechStart;
    for (const c of this.speech) {
      const e = envelope(t - c.at, 0.05, 0.03, 0.1);
      if (e <= 0) continue;
      const name = `viseme_${c.viseme}`;
      w[name] = Math.max(w[name] ?? 0, e * (c.viseme === 'E' || c.viseme === 'I' ? 0.45 : 0.7));
      if (c.viseme === 'aa' || c.viseme === 'O' || c.viseme === 'E') {
        w.jawOpen = Math.max(w.jawOpen ?? 0, e * 0.22);
      }
    }
    const last = this.speech.at(-1);
    if (last && t > last.at + 0.5) this.speech = [];
  }

  private idle(): void {
    const idle = this.frame?.idle ?? { nervous: 0, arousal: 0, blinkRate: 1 };
    if (this.time >= this.nextBlink) {
      this.blinks.push(this.time);
      const rate = idle.blinkRate * (1 + 1.6 * idle.nervous + 0.5 * Math.max(0, idle.arousal));
      this.nextBlink = this.time + (1.2 + this.random() * 4.2) / rate;
    }
    if (this.back && this.time >= this.back.at) {
      this.gaze = this.back.target;
      this.back = null;
    }
    if (this.time >= this.nextSaccade) {
      this.saccade(idle.nervous);
    }
    if (this.glance && this.time > this.glance.until) this.glance = null;
  }

  private saccade(nervous: number): void {
    const reach = this.calm ? 0.4 : 1;
    this.offset = [(this.random() - 0.5) * 0.08 * reach, (this.random() - 0.5) * 0.05 * reach];
    this.nextSaccade = this.time + 0.5 + this.random() * 2;
    const free = this.gaze === 'player' && !this.glance && !this.thinking;
    if (free && this.random() < 0.06 + 0.75 * nervous) {
      const pick = GLANCES[Math.floor(this.random() * (nervous > 0.3 ? 4 : 2))] ?? 'cards';
      this.glance = { target: pick, until: this.time + 0.35 + this.random() * 0.6 };
    }
  }

  private blink(): number {
    let v = 0;
    this.blinks = this.blinks.filter((t0) => {
      const e = envelope(this.time - t0, 0.07, 0.04, 0.13);
      v = Math.max(v, e);
      return e >= 0 || this.time < t0;
    });
    return v;
  }

  private look(dt: number, w: Weights): [number, number] {
    const at = this.thinking ? 'think' : (this.glance?.target ?? this.gaze);
    const target = GAZE[at];
    this.eyes[0] = ease(this.eyes[0], target[0] + this.offset[0], 18, dt);
    this.eyes[1] = ease(this.eyes[1], target[1] + this.offset[1], 18, dt);
    const yaw = clamp(this.eyes[0] * 0.75, -0.45, 0.45);
    const pitch = clamp(this.eyes[1] * 0.7, -0.3, 0.35);
    for (const side of ['Left', 'Right']) {
      add(w, `eyeLookDown${side}`, Math.max(0, pitch) * 1.4);
      add(w, `eyeLookUp${side}`, Math.max(0, -pitch) * 1.2);
    }
    return [yaw, pitch];
  }

  private body(dt: number): Omit<Pose, 'weights' | 'eyes'> {
    const [v, a, d] = this.frame?.shown ?? [0, 0, 0];
    const nervous = this.frame?.idle.nervous ?? 0;
    const t = this.time;
    const moodPitch = -0.08 * d - 0.03 * a + 0.07 * Math.max(0, -v);
    this.head[0] = ease(this.head[0], this.eyes[0] * 0.35, 4, dt);
    this.head[1] = ease(this.head[1], this.eyes[1] * 0.3 + moodPitch, 3, dt);
    this.head[2] = ease(this.head[2], 0.04 * d, 2, dt);
    const s = this.calm ? 0 : 1;
    const sway = [
      s * (Math.sin(t * 0.37) * 0.025 + Math.sin(t * 0.91) * 0.01),
      s * Math.sin(t * 0.53 + 1) * 0.015,
      s * Math.sin(t * 0.29 + 2) * 0.015,
    ] as const;
    const breath =
      Math.sin((t * 2 * Math.PI) / (4.2 - 1.2 * nervous)) * (this.calm ? 0.006 : 0.012);
    return {
      head: [this.head[1] * 0.6 + sway[1], this.head[0] * 0.6 + sway[0], this.head[2] + sway[2]],
      neck: [this.head[1] * 0.4, this.head[0] * 0.4, 0],
      spine: [-breath + 0.03 * Math.max(0, -d), 0, 0],
      shoulder: breath * 0.6,
    };
  }
}
