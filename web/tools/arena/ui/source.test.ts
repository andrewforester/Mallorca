import { describe, expect, it } from 'vitest';
import { sourceFor } from './source.ts';

describe('sourceFor', () => {
  it('reads the dev server API in development', () => {
    const source = sourceFor(true, '/');
    expect(source.runsUrl).toBe('/api/runs');
    expect(source.handsUrl('a b.jsonl')).toBe('/api/hands?file=a%20b.jsonl');
  });

  it('reads the published files under the base in a build', () => {
    const source = sourceFor(false, '/mallorca/arena/');
    expect(source.runsUrl).toBe('/mallorca/arena/index.json');
    expect(source.handsUrl('cfr-math.jsonl.gz')).toBe('/mallorca/arena/cfr-math.jsonl.gz');
    expect(source.empty).toMatch(/No published runs yet/);
  });
});
