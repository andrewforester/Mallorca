import { describe, expect, it } from 'vitest';
import { parseActions, toEngineAction, toIncr } from './actions.ts';

describe('parseActions', () => {
  it('reads an empty string as an empty preflop', () => {
    expect(parseActions('')).toEqual([[]]);
  });

  it('splits streets and reads street-level bet amounts', () => {
    const streets = parseActions('b200c/kk/kb200c/kb400c');
    expect(streets).toHaveLength(4);
    expect(streets[0]).toEqual([{ kind: 'b', to: 200 }, { kind: 'c' }]);
    expect(streets[3]).toEqual([{ kind: 'k' }, { kind: 'b', to: 400 }, { kind: 'c' }]);
  });

  it('keeps an empty street after a trailing slash', () => {
    const streets = parseActions('b200c/kk/kk/');
    expect(streets).toHaveLength(4);
    expect(streets[3]).toEqual([]);
  });

  it('keeps the empty streets after an all-in', () => {
    const streets = parseActions('b20000c///');
    expect(streets).toEqual([[{ kind: 'b', to: 20000 }, { kind: 'c' }], [], [], []]);
  });

  it('rejects unknown characters', () => {
    expect(() => parseActions('x')).toThrow();
    expect(() => parseActions('b')).toThrow();
  });
});

describe('toEngineAction and toIncr', () => {
  it('round-trip every action', () => {
    for (const street of parseActions('ck/b100c/kk/kb300f')) {
      for (const action of street) {
        const incr = toIncr(toEngineAction(action));
        expect(parseActions(incr)).toEqual([[action]]);
      }
    }
  });

  it('maps the kinds to the engine', () => {
    expect(toEngineAction({ kind: 'k' })).toEqual({ kind: 'check' });
    expect(toEngineAction({ kind: 'c' })).toEqual({ kind: 'call' });
    expect(toEngineAction({ kind: 'f' })).toEqual({ kind: 'fold' });
    expect(toEngineAction({ kind: 'b', to: 250 })).toEqual({ kind: 'raise', to: 250 });
  });
});
