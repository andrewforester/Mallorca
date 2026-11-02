import type { Action } from '../../../../src/engine/index.ts';

export type SlumbotAction = { kind: 'k' | 'c' | 'f' } | { kind: 'b'; to: number };

const TOKEN = /b\d+|[kcf]/y;

function parseStreet(text: string): SlumbotAction[] {
  const actions: SlumbotAction[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    const start = TOKEN.lastIndex;
    const match = TOKEN.exec(text);
    if (match === null) {
      throw new Error(`Bad Slumbot action at "${text.slice(start)}"`);
    }
    const token = match[0];
    if (token === 'k' || token === 'c' || token === 'f') actions.push({ kind: token });
    else actions.push({ kind: 'b', to: Number(token.slice(1)) });
  }
  return actions;
}

export function parseActions(text: string): SlumbotAction[][] {
  return text.split('/').map(parseStreet);
}

export function toEngineAction(action: SlumbotAction): Action {
  switch (action.kind) {
    case 'k':
      return { kind: 'check' };
    case 'c':
      return { kind: 'call' };
    case 'f':
      return { kind: 'fold' };
    case 'b':
      return { kind: 'raise', to: action.to };
  }
}

export function toIncr(action: Action): string {
  switch (action.kind) {
    case 'check':
      return 'k';
    case 'call':
      return 'c';
    case 'fold':
      return 'f';
    case 'raise':
      return `b${action.to}`;
  }
}
