import { useEffect, useState } from 'preact/hooks';
import type { ChatLine } from '../game/index.ts';

export const TYPE_MS_PER_CHAR = 25;
export const BUBBLE_MS = 7000;

const firstShown = new WeakMap<ChatLine, number>();

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function shownFor(line: ChatLine): number {
  const now = Date.now();
  const since = firstShown.get(line);
  if (since === undefined) {
    firstShown.set(line, now);
    return 0;
  }
  return now - since;
}

function typedAt(text: string, elapsed: number): number {
  return prefersReducedMotion()
    ? text.length
    : Math.min(text.length, Math.floor(elapsed / TYPE_MS_PER_CHAR));
}

function useTypewriter(text: string, elapsed: number): string {
  const [count, setCount] = useState(() => typedAt(text, elapsed));
  useEffect(() => {
    if (count >= text.length) {
      return undefined;
    }
    const timer = setInterval(() => {
      setCount((shown) => {
        if (shown + 1 >= text.length) {
          clearInterval(timer);
        }
        return Math.min(shown + 1, text.length);
      });
    }, TYPE_MS_PER_CHAR);
    return () => clearInterval(timer);
  }, [text]);
  return text.slice(0, count);
}

function Typed({ line, elapsed }: { line: ChatLine; elapsed: number }) {
  const [visible, setVisible] = useState(true);
  const shown = useTypewriter(line.text, elapsed);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), BUBBLE_MS - elapsed);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) {
    return null;
  }
  return (
    <p
      class={`bubble bubble-${line.speaker} glass`}
      style={{ '--bubble-elapsed': `${elapsed}ms` }}
      data-testid={`bubble-${line.speaker}`}
    >
      <span class="visually-hidden">{line.text}</span>
      <span class="bubble-typed" aria-hidden="true">
        {shown}
      </span>
      <span class="bubble-rest" aria-hidden="true">
        {line.text.slice(shown.length)}
      </span>
    </p>
  );
}

function Shown({ line }: { line: ChatLine }) {
  const [elapsed] = useState(() => shownFor(line));
  return elapsed >= BUBBLE_MS ? null : <Typed line={line} elapsed={elapsed} />;
}

export function Bubble({ line }: { line: ChatLine | null }) {
  return line === null ? null : <Shown key={line.id} line={line} />;
}
