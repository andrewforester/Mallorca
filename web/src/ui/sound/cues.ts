import type { LogEntry, Phase } from '../../game/index.ts';

export type Cue = 'deal' | 'check' | 'chips' | 'fold' | 'turn' | 'win' | 'allIn';

const CUE_BY_KEY: Record<string, Cue> = {
  handStarted: 'deal',
  flop: 'deal',
  turn: 'deal',
  river: 'deal',
  post: 'chips',
  call: 'chips',
  raise: 'chips',
  bet: 'chips',
  check: 'check',
  fold: 'fold',
  allIn: 'allIn',
  win: 'win',
};

export function cuesFor(entries: LogEntry[]): Cue[] {
  const cues: Cue[] = [];
  for (const entry of entries) {
    const cue = CUE_BY_KEY[entry.key];
    if (cue !== undefined && !cues.includes(cue)) cues.push(cue);
  }
  return cues.includes('allIn') ? cues.filter((cue) => cue !== 'chips') : cues;
}

export function turnCue(previous: Phase, next: Phase): Cue | null {
  return next === 'humanToAct' && previous !== 'humanToAct' ? 'turn' : null;
}
