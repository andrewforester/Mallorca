import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cue } from './cues.ts';
import { createSynthPlayer, defaultContext, silentPlayer } from './player.ts';

interface Param {
  value: number;
  setValueAtTime(v: number, t: number): Param;
  linearRampToValueAtTime(v: number, t: number): Param;
  exponentialRampToValueAtTime(v: number, t: number): Param;
}

function param(): Param {
  const p: Param = {
    value: 0,
    setValueAtTime: () => p,
    linearRampToValueAtTime: () => p,
    exponentialRampToValueAtTime: () => p,
  };
  return p;
}

interface Source {
  kind: 'oscillator' | 'buffer';
  starts: number[];
  stops: number[];
  frequency: Param;
  type: string;
  buffer: unknown;
  connect(): void;
  start(t: number): void;
  stop(t: number): void;
}

class FakeContext {
  currentTime = 5;
  sampleRate = 8000;
  state: 'suspended' | 'running' = 'suspended';
  destination = {};
  resumed = 0;
  sources: Source[] = [];

  resume(): Promise<void> {
    this.resumed += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  private source(kind: Source['kind']): Source {
    const s: Source = {
      kind,
      starts: [],
      stops: [],
      frequency: param(),
      type: '',
      buffer: null,
      connect: () => undefined,
      start: (t) => s.starts.push(t),
      stop: (t) => s.stops.push(t),
    };
    this.sources.push(s);
    return s;
  }

  createOscillator(): Source {
    return this.source('oscillator');
  }

  createBufferSource(): Source {
    return this.source('buffer');
  }

  createGain() {
    return { gain: param(), connect: () => undefined };
  }

  createBiquadFilter() {
    return { type: '', frequency: param(), Q: param(), connect: () => undefined };
  }

  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
}

const CUES: Cue[] = ['deal', 'check', 'chips', 'fold', 'turn', 'win', 'allIn'];

function setup() {
  const made: FakeContext[] = [];
  const player = createSynthPlayer(() => {
    const ctx = new FakeContext();
    made.push(ctx);
    return ctx as unknown as AudioContext;
  });
  return { made, player };
}

describe('createSynthPlayer', () => {
  it('makes no context before unlock', () => {
    const { made, player } = setup();
    player.play('deal');
    expect(made).toHaveLength(0);
  });

  it('makes one context however often it is unlocked, and resumes it', () => {
    const { made, player } = setup();
    player.unlock();
    player.unlock();
    expect(made).toHaveLength(1);
    expect(made[0]?.resumed).toBeGreaterThan(0);
  });

  it.each(CUES)('plays %s within 400 ms', (cue) => {
    const { made, player } = setup();
    player.unlock();
    player.play(cue);
    const ctx = made[0] as FakeContext;
    expect(ctx.sources.length).toBeGreaterThan(0);
    for (const s of ctx.sources) {
      expect(s.starts.length).toBeGreaterThan(0);
      for (const t of [...s.starts, ...s.stops]) {
        expect(t).toBeGreaterThanOrEqual(ctx.currentTime);
        expect(t).toBeLessThanOrEqual(ctx.currentTime + 0.4 + 1e-9);
      }
    }
  });

  it.each(CUES)('offsets %s by the delay', (cue) => {
    const { made, player } = setup();
    player.unlock();
    player.play(cue, 200);
    const ctx = made[0] as FakeContext;
    const times = ctx.sources.flatMap((s) => [...s.starts, ...s.stops]);
    expect(Math.min(...times)).toBeCloseTo(ctx.currentTime + 0.2);
    expect(Math.max(...times)).toBeLessThanOrEqual(ctx.currentTime + 0.6 + 1e-9);
  });

  it('starts the turn chime at currentTime plus the delay', () => {
    const { made, player } = setup();
    player.unlock();
    player.play('turn', 200);
    const ctx = made[0] as FakeContext;
    expect(ctx.sources[0]?.starts[0]).toBeCloseTo(ctx.currentTime + 0.2);
    expect(ctx.sources.map((s) => s.frequency.value)).toEqual([660, 880]);
  });

  it('does nothing when the factory returns null', () => {
    const player = createSynthPlayer(() => null);
    expect(() => {
      player.unlock();
      player.play('win');
    }).not.toThrow();
  });

  it('does nothing without Web Audio by default', () => {
    const player = createSynthPlayer();
    expect(() => {
      player.unlock();
      player.play('win');
    }).not.toThrow();
  });
});

describe('hardening', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('swallows a rejected resume', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const ctx = new FakeContext();
    ctx.resume = () => Promise.reject(new Error('blocked'));
    const player = createSynthPlayer(() => ctx as unknown as AudioContext);
    expect(() => player.unlock()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('returns no context when the AudioContext constructor throws', () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('not allowed');
        }
      },
    );
    expect(defaultContext()).toBeNull();
  });
});

describe('silentPlayer', () => {
  it('does nothing', () => {
    expect(() => {
      silentPlayer.unlock();
      silentPlayer.play('deal', 10);
    }).not.toThrow();
  });
});
