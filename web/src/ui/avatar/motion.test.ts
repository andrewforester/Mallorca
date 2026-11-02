import { describe, expect, it } from 'vitest';
import type { FaceCue, FaceFrame } from '../../game/index.ts';
import { speechOf } from '../../game/index.ts';
import { Motion } from './motion.ts';
import type { Pose } from './motion.ts';

const half = () => 0.5;
const STEP = 1 / 60;

function run(motion: Motion, seconds: number): Pose[] {
  const poses: Pose[] = [];
  for (let t = 0; t < seconds; t += STEP) poses.push(motion.tick(STEP));
  return poses;
}

const frame = (weights: Record<string, number>, nervous = 0): FaceFrame => ({
  felt: [0, 0, 0],
  shown: [0, 0, 0],
  mask: 0,
  weights,
  idle: { nervous, arousal: 0, blinkRate: 1 },
  prosody: { rate: 1, pitch: 1, volume: 1 },
});

const smile: FaceCue = {
  id: 1,
  kind: 'pulse',
  pulse: {
    weights: { mouthSmileLeft: 0.8 },
    amp: 1,
    attack: 0.1,
    hold: 0.2,
    release: 0.2,
    delay: 0,
    blinks: 0,
  },
};

describe('motion', () => {
  it('eases toward the frame and blinks on its own', () => {
    const motion = new Motion({ random: half, calm: false });
    motion.setFrame(frame({ browInnerUp: 0.6 }));
    const poses = run(motion, 6);
    expect(poses.at(-1)!.weights.browInnerUp).toBeCloseTo(0.6, 2);
    expect(Math.max(...poses.map((p) => p.weights.eyeBlinkLeft ?? 0))).toBeGreaterThan(0.9);
  });

  it('plays a reaction once and lets it fade', () => {
    const motion = new Motion({ random: half, calm: false });
    motion.cue(smile);
    const poses = run(motion, 1);
    expect(poses[15]!.weights.mouthSmileLeft).toBeCloseTo(0.8);
    expect(poses.at(-1)!.weights.mouthSmileLeft ?? 0).toBe(0);
  });

  it('looks at the chips and comes back to the player', () => {
    const motion = new Motion({ random: half, calm: true });
    motion.cue({ id: 2, kind: 'gaze', target: 'chips', then: 'player' });
    const poses = run(motion, 2);
    expect(poses[30]!.eyes[0]).toBeLessThan(-0.15);
    expect(Math.abs(poses.at(-1)!.eyes[0])).toBeLessThan(0.05);
  });

  it('looks up and aside while thinking', () => {
    const motion = new Motion({ random: half, calm: true });
    motion.setThinking(true);
    expect(run(motion, 1).at(-1)!.eyes[1]).toBeLessThan(-0.1);
  });

  it('moves her lips along the visemes of a line', () => {
    const motion = new Motion({ random: half, calm: true });
    motion.speak(speechOf('Pot', { rate: 1, pitch: 1, volume: 1 }));
    const poses = run(motion, 0.5);
    expect(Math.max(...poses.map((p) => p.weights.viseme_PP ?? 0))).toBeGreaterThan(0.5);
    expect(Math.max(...poses.map((p) => p.weights.viseme_O ?? 0))).toBeGreaterThan(0.5);
  });

  it('holds the head still under reduced motion', () => {
    const calm = run(new Motion({ random: half, calm: true }), 3);
    const lively = run(new Motion({ random: half, calm: false }), 3);
    expect(Math.abs(calm.at(-1)!.head[1])).toBeLessThan(1e-6);
    expect(Math.abs(lively.at(-1)!.head[1])).toBeGreaterThan(1e-3);
  });
});
