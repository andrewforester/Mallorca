import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/ui/styles/tokens.css', 'utf8');
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');

function tokens(block: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)) {
    found.set(match[1] as string, (match[2] as string).toLowerCase());
  }
  return found;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi as number) + 0.05) / ((lo as number) + 0.05);
}

const light = tokens(css.slice(0, darkStart));
const dark = new Map([...light, ...tokens(css.slice(darkStart))]);

const pairs = [
  ['color-accent', 'color-accent-text'],
  ['color-danger', 'color-danger-text'],
  ['color-felt', 'color-felt-text'],
  ['color-bg', 'color-text'],
  ['color-surface', 'color-text'],
  ['color-surface', 'color-muted'],
  ['color-paper', 'color-paper-text'],
  ['color-coach-surface', 'color-coach'],
  ['color-coach-surface', 'color-coach-text'],
  ['color-her-surface', 'color-text'],
] as const;

describe('colour tokens', () => {
  for (const [theme, values] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    for (const [background, text] of pairs) {
      it(`${text} on ${background} reaches 4.5:1 in the ${theme} theme`, () => {
        const ratio = contrast(values.get(background) as string, values.get(text) as string);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
