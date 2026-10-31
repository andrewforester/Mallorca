export interface SpotOdds {
  toCall: number;
  requiredEquity: number;
  mdf: number;
  bluffShare: number;
}

export function spotOdds(toCall: number, pot: number): SpotOdds | null {
  if (toCall <= 0 || pot <= 0) {
    return null;
  }
  const requiredEquity = toCall / (pot + toCall);
  return { toCall, requiredEquity, mdf: (pot - toCall) / pot, bluffShare: requiredEquity };
}
