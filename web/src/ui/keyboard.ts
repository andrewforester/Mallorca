import { useEffect } from 'preact/hooks';

export interface KeyHandlers {
  enabled: boolean;
  fold: () => void;
  passive: () => void;
  raise: () => void;
  adjust: (direction: 1 | -1) => void;
}

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: unknown;
}

type Binding = (handlers: KeyHandlers) => void;

const fold: Binding = (handlers) => handlers.fold();
const passive: Binding = (handlers) => handlers.passive();
const raise: Binding = (handlers) => handlers.raise();
const up: Binding = (handlers) => handlers.adjust(1);
const down: Binding = (handlers) => handlers.adjust(-1);

const BINDINGS = new Map<string, Binding>([
  ['f', fold],
  ['F', fold],
  ['c', passive],
  ['C', passive],
  ['r', raise],
  ['R', raise],
  ['ArrowRight', up],
  ['ArrowUp', up],
  ['ArrowLeft', down],
  ['ArrowDown', down],
]);

const NOT_TEXT = new Set(['button', 'checkbox', 'radio', 'range', 'reset', 'submit']);

function isTyping(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) {
    return false;
  }
  const node = target as { tagName?: unknown; type?: unknown; isContentEditable?: unknown };
  if (node.isContentEditable === true || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') {
    return true;
  }
  return node.tagName === 'INPUT' && !NOT_TEXT.has(String(node.type));
}

function hasModifier(event: KeyLike): boolean {
  return event.ctrlKey === true || event.metaKey === true || event.altKey === true;
}

export function handleKey(event: KeyLike, handlers: KeyHandlers): boolean {
  const binding = BINDINGS.get(event.key);
  if (!handlers.enabled || hasModifier(event) || binding === undefined || isTyping(event.target)) {
    return false;
  }
  binding(handlers);
  return true;
}

export function useKeyboard(handlers: KeyHandlers): void {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (handleKey(event, handlers)) {
        event.preventDefault();
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [handlers]);
}
