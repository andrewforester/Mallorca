import { describe, expect, it } from 'vitest';
import { restingFaceOf } from '../../game/index.ts';
import type { FaceFrame, Session } from '../../game/index.ts';
import { seatFrame } from './seatFrame.ts';

const sessionWith = (frame: FaceFrame | null) =>
  ({ getState: () => ({ faceNow: () => frame }) }) as unknown as Session;

describe('seatFrame', () => {
  it('shows the chosen character at rest before a game', () => {
    expect(seatFrame(sessionWith(null), 'toughBoss')).toBe(restingFaceOf('toughBoss'));
    expect(seatFrame(sessionWith(null), undefined)).toBe(restingFaceOf('mallorca'));
  });

  it('shows her feelings once the game has them', () => {
    const live = restingFaceOf('lola');
    expect(seatFrame(sessionWith(live), 'toughBoss')).toBe(live);
  });
});
