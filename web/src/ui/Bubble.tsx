import { useEffect, useState } from 'preact/hooks';
import type { ChatLine } from '../game/index.ts';

export const TYPE_MS_PER_CHAR = 25;
export const BUBBLE_MS = 7000;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function useTypewriter(text: string): string {
  const [count, setCount] = useState(() => (prefersReducedMotion() ? text.length : 0));
  useEffect(() => {
    if (prefersReducedMotion()) {
      setCount(text.length);
      return undefined;
    }
    setCount(0);
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

function Typed({ line }: { line: ChatLine }) {
  const [visible, setVisible] = useState(true);
  const shown = useTypewriter(line.text);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), BUBBLE_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) {
    return null;
  }
  return (
    <p class={`bubble bubble-${line.speaker} glass`} data-testid={`bubble-${line.speaker}`}>
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

export function Bubble({ line }: { line: ChatLine | null }) {
  return line === null ? null : <Typed key={line.id} line={line} />;
}
