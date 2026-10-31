export interface VisemeCue {
  viseme: string;
  at: number;
  charIndex: number;
}

const TABLE: ReadonlyArray<[RegExp, string]> = [
  [/^(ch|sh|j)/, 'CH'],
  [/^th/, 'TH'],
  [/^a/, 'aa'],
  [/^e/, 'E'],
  [/^[iy]/, 'I'],
  [/^o/, 'O'],
  [/^[uw]/, 'U'],
  [/^[bmp]/, 'PP'],
  [/^[fv]/, 'FF'],
  [/^[tdl]/, 'DD'],
  [/^n/, 'nn'],
  [/^[szc]/, 'SS'],
  [/^[kgqx]/, 'kk'],
  [/^r/, 'RR'],
];

export function visemesOf(text: string, lettersPerSecond: number): VisemeCue[] {
  const lower = text.toLowerCase();
  const step = 1 / lettersPerSecond;
  const cues: VisemeCue[] = [];
  let t = 0.05;
  let i = 0;
  while (i < lower.length) {
    const rest = lower.slice(i);
    if (/^[\s,.!?;:]/.test(rest)) {
      t += /^[,.!?;:]/.test(rest) ? step * 2.5 : step * 0.6;
      i += 1;
      continue;
    }
    const hit = TABLE.find(([re]) => re.test(rest));
    if (hit) {
      cues.push({ viseme: hit[1], at: t, charIndex: i });
    }
    t += step;
    i += hit && /^(ch|sh|th)/.test(rest) ? 2 : 1;
  }
  return cues;
}
