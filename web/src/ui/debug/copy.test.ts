import { describe, expect, it } from 'vitest';
import { COPY } from './copy.ts';

function strings(node: unknown): string[] {
  if (typeof node === 'string') {
    return [node];
  }
  return Object.values(node as Record<string, unknown>).flatMap(strings);
}

describe('the copy of the emotion debug panel', () => {
  it('has no all-caps words and no dashes as punctuation', () => {
    for (const text of strings(COPY)) {
      expect(text).not.toMatch(/\b[A-Z]{2,}\b/);
      expect(text).not.toMatch(/[–—]/);
      expect(text).not.toMatch(/\s-\s/);
    }
  });
});
