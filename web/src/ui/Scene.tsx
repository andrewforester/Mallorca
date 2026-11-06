import type { ComponentChildren } from 'preact';

export interface SceneProps {
  children: ComponentChildren;
  dimmed?: boolean;
  simple?: boolean;
}

export function Scene({ children, dimmed = false, simple = false }: SceneProps) {
  const className = ['scene', dimmed ? 'scene-dimmed' : '', simple ? 'scene-simple' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div class={className} data-testid="scene">
      <div class="scene-content">{children}</div>
    </div>
  );
}
