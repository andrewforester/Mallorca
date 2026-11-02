import { describe, expect, it } from 'vitest';
import { onPageExit } from './pageExit.ts';

function target() {
  const listeners = new Map<string, (() => void)[]>();
  return {
    visibilityState: 'visible',
    addEventListener(type: string, listener: () => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    fire(type: string) {
      for (const listener of listeners.get(type) ?? []) {
        listener();
      }
    },
  };
}

describe('onPageExit', () => {
  it('calls back on pagehide and when the document becomes hidden', () => {
    const win = target();
    const doc = target();
    let exits = 0;
    onPageExit(win, doc, () => {
      exits += 1;
    });
    doc.fire('visibilitychange');
    expect(exits).toBe(0);
    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    expect(exits).toBe(1);
    win.fire('pagehide');
    expect(exits).toBe(2);
  });
});
