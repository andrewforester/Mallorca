import type { Cue } from './cues.ts';

export interface SoundPlayer {
  unlock(): void;
  play(cue: Cue, delayMs?: number): void;
}

export const silentPlayer: SoundPlayer = {
  unlock: () => undefined,
  play: () => undefined,
};

const MASTER_GAIN = 0.25;
const NOISE_SECONDS = 0.2;
const FLOOR = 0.001;

interface Rig {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
}

type Builder = (rig: Rig, t: number) => void;

function envelope(rig: Rig, t: number, dur: number, peak: number): GainNode {
  const gain = rig.ctx.createGain();
  gain.gain.setValueAtTime(FLOOR, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.003);
  gain.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
  gain.connect(rig.master);
  return gain;
}

function noiseSource(rig: Rig, t: number, dur: number): AudioBufferSourceNode {
  const source = rig.ctx.createBufferSource();
  source.buffer = rig.noise;
  source.start(t);
  source.stop(t + dur);
  return source;
}

function click(rig: Rig, t: number, freq: number, dur = 0.025): void {
  const filter = rig.ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 4;
  filter.connect(envelope(rig, t, dur, 1));
  noiseSource(rig, t, dur).connect(filter);
}

interface Tone {
  freq: number;
  dur: number;
  peak: number;
}

function tone(rig: Rig, t: number, { freq, dur, peak }: Tone): void {
  const osc = rig.ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  osc.connect(envelope(rig, t, dur, peak));
  osc.start(t);
  osc.stop(t + dur);
}

function clicks(rig: Rig, t: number, count: number, freq: number): void {
  for (let i = 0; i < count; i += 1) click(rig, t + i * 0.04, freq);
}

const deal: Builder = (rig, t) => {
  const filter = rig.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2400;
  filter.connect(envelope(rig, t, 0.06, 0.8));
  noiseSource(rig, t, 0.06).connect(filter);
};

const check: Builder = (rig, t) => {
  tone(rig, t, { freq: 120, dur: 0.03, peak: 1 });
  tone(rig, t + 0.09, { freq: 120, dur: 0.03, peak: 1 });
};

const chips: Builder = (rig, t) => clicks(rig, t, 3, 3000);

const fold: Builder = (rig, t) => {
  const filter = rig.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, t);
  filter.frequency.exponentialRampToValueAtTime(300, t + 0.15);
  filter.connect(envelope(rig, t, 0.15, 0.5));
  noiseSource(rig, t, 0.15).connect(filter);
};

const turn: Builder = (rig, t) => {
  tone(rig, t, { freq: 660, dur: 0.12, peak: 0.7 });
  tone(rig, t + 0.12, { freq: 880, dur: 0.12, peak: 0.7 });
};

const win: Builder = (rig, t) => {
  clicks(rig, t, 4, 3000);
  tone(rig, t + 0.18, { freq: 880, dur: 0.2, peak: 0.7 });
};

const allIn: Builder = (rig, t) => clicks(rig, t, 6, 1800);

const BUILDERS: Record<Cue, Builder> = { deal, check, chips, fold, turn, win, allIn };

function whiteNoise(ctx: AudioContext): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function createRig(ctx: AudioContext): Rig {
  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(ctx.destination);
  return { ctx, master, noise: whiteNoise(ctx) };
}

export function defaultContext(): AudioContext | null {
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  if (Ctor === undefined) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

export function createSynthPlayer(
  makeContext: () => AudioContext | null = defaultContext,
): SoundPlayer {
  let rig: Rig | null = null;
  return {
    unlock() {
      if (rig === null) {
        const ctx = makeContext();
        if (ctx === null) return;
        rig = createRig(ctx);
      }
      if (rig.ctx.state === 'suspended') void rig.ctx.resume().catch(() => undefined);
    },
    play(cue, delayMs = 0) {
      if (rig === null) return;
      BUILDERS[cue](rig, rig.ctx.currentTime + delayMs / 1000);
    },
  };
}
