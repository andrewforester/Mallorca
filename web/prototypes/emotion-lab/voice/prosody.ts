import type { Pad } from '../../../src/emotion/index.ts';
import { clamp } from '../lab.ts';

export interface Prosody {
  rate: number;
  pitch: number;
  volume: number;
}

export function prosodyOf(shown: Pad, tilt: number, sadness: number): Prosody {
  const [pleasure, arousal] = shown;
  return {
    rate: clamp(1 + 0.2 * arousal - 0.12 * sadness + 0.1 * tilt, 0.7, 1.4),
    pitch: clamp(1 + 0.2 * arousal + 0.1 * pleasure - 0.1 * sadness, 0.6, 1.5),
    volume: clamp(0.8 + 0.2 * arousal + 0.1 * tilt, 0.4, 1),
  };
}
