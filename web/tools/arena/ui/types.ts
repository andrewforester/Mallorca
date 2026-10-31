export interface SavedReport {
  a: string;
  b: string;
  pairs: number;
  hands: number;
  seed: number;
  bbPer100: number;
  ci95: number | null;
  durationMs: number;
  commit: string;
  finishedAt: string;
}

export interface RunEntry {
  file: string;
  report: SavedReport;
  handsFile: string | null;
  handsBytes: number | null;
}
