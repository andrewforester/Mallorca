import type { Pad } from '../emotion/index.ts';
import { MALLORCA_LOOK } from './look.ts';
import { clamp } from './math.ts';
import { visemesOf } from './visemes.ts';
import type { VisemeCue } from './visemes.ts';

export interface Prosody {
  rate: number;
  pitch: number;
  volume: number;
}

export function prosodyOf(shown: Pad, overload: number, sadness: number): Prosody {
  const [pleasure, arousal] = shown;
  return {
    rate: clamp(1 + 0.2 * arousal - 0.12 * sadness + 0.1 * overload, 0.7, 1.4),
    pitch: clamp(1 + 0.2 * arousal + 0.1 * pleasure - 0.1 * sadness, 0.6, 1.5),
    volume: clamp(0.8 + 0.2 * arousal + 0.1 * overload, 0.4, 1),
  };
}

export const speechOf = (text: string, prosody: Prosody): VisemeCue[] =>
  visemesOf(text, MALLORCA_LOOK.lettersPerSecond * prosody.rate);
