import type { ComponentChildren } from 'preact';
import attic from './scene/attic-portrait.webp';

export const ATTIC_URL: string = attic;

export interface FaceFrameProps {
  name: string;
  face: ComponentChildren;
}

export function FaceFrame({ name, face }: FaceFrameProps) {
  const off = face === undefined || face === null;
  return (
    <div class={off ? 'face-frame face-frame-off' : 'face-frame'} data-testid="face-frame">
      <img class="face-room" src={attic} alt="" aria-hidden="true" decoding="async" />
      {off ? <span class="face-frame-name">{name}</span> : face}
      <img class="face-rail" src={attic} alt="" aria-hidden="true" decoding="async" />
    </div>
  );
}
