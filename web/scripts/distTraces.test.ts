import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEBUG_MARKERS, distTraces } from './distTraces.ts';

const made: string[] = [];

function dist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'dist-'));
  made.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true });
});

describe('distTraces', () => {
  it('finds nothing in a clean build', () => {
    expect(distTraces(dist({ 'index.html': '<div id="app">', 'assets/a.js': 'x=1' }))).toEqual([]);
  });

  it('names every file and marker of the debug panel it finds, in nested folders too', () => {
    const dir = dist({
      'assets/index.js': 'a="emotion-debug-toggle"',
      'arena/assets/b.js': '{sentStyle:null,engineStyle:[]}',
      'assets/c.css': '.ok{}',
    });
    expect(distTraces(dir)).toEqual([
      'arena/assets/b.js: sentStyle',
      'arena/assets/b.js: engineStyle',
      'assets/index.js: emotion-debug',
    ]);
  });

  it('checks the three markers of the contract', () => {
    expect(DEBUG_MARKERS).toEqual(['emotion-debug', 'sentStyle', 'engineStyle']);
  });
});
