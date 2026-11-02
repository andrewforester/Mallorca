import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const DEBUG_MARKERS = ['emotion-debug', 'sentStyle', 'engineStyle'] as const;

const TEXT = /\.(html|js|mjs|css|json|txt|svg|map)$/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? files(path) : [path];
    })
    .sort();
}

export function distTraces(dir: string, markers: readonly string[] = DEBUG_MARKERS): string[] {
  return files(dir)
    .filter((path) => TEXT.test(path))
    .flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      const name = relative(dir, path).split('\\').join('/');
      return markers.filter((m) => text.includes(m)).map((m) => `${name}: ${m}`);
    });
}
