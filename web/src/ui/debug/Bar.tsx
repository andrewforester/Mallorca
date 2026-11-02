import { clamp } from './format.ts';

export interface BarProps {
  label: string;
  value: number;
  text: string;
  centered?: boolean;
}

function fillStyle(value: number, centered: boolean): Record<string, string> {
  if (!centered) {
    return { left: '0%', width: `${clamp(value, 0, 1) * 100}%` };
  }
  const d = clamp(Math.log2(value), -1, 1);
  return { left: `${d >= 0 ? 50 : 50 + d * 50}%`, width: `${Math.abs(d) * 50}%` };
}

export function Bar({ label, value, text, centered = false }: BarProps) {
  const up = !centered || value >= 1;
  return (
    <div class="debug-bar">
      <span class="debug-bar-label">{label}</span>
      <span class={`debug-bar-track${centered ? ' debug-bar-centered' : ''}`}>
        <i class={up ? 'debug-up' : 'debug-down'} style={fillStyle(value, centered)} />
      </span>
      <span class="debug-bar-value">{text}</span>
    </div>
  );
}
