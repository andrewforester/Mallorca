export interface FaceLook {
  brows: number;
  eyes: number;
  mouth: number;
  smileSide: number;
  blink: number;
  lettersPerSecond: number;
  leak: number;
}

export const leakOf = (neuroticism: number): number => 1 + 0.5 * neuroticism;

export const MALLORCA_LOOK: FaceLook = {
  brows: 1.1,
  eyes: 1,
  mouth: 1.1,
  smileSide: 0.3,
  blink: 1,
  lettersPerSecond: 13,
  leak: leakOf(0.1),
};
