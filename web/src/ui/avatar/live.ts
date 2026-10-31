import type { FaceCue, FaceFrame, VisemeCue } from '../../game/index.ts';
import { Avatar } from './avatar.ts';
import { Motion } from './motion.ts';

export interface LiveOptions {
  url: string;
  frame: () => FaceFrame | null;
  calm: boolean;
  onLost: () => void;
}

export interface LiveFace {
  cue(cue: FaceCue): void;
  thinking(on: boolean): void;
  speak(cues: VisemeCue[]): void;
  sync(charIndex: number): void;
  silence(): void;
  dispose(): void;
}

const FRAME_EVERY_S = 0.1;
const MAX_STEP_S = 0.1;

export async function mountFace(host: HTMLElement, options: LiveOptions): Promise<LiveFace> {
  const avatar = new Avatar();
  await avatar.load(options.url);
  const motion = new Motion({ random: Math.random, calm: options.calm });
  avatar.canvas.classList.add('face-canvas');
  host.append(avatar.canvas);
  const resize = () => avatar.resize(host.clientWidth, host.clientHeight);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  let raf = 0;
  let last = 0;
  let sinceFrame = FRAME_EVERY_S;
  const loop = (now: number) => {
    const dt = last === 0 ? 0 : Math.min(MAX_STEP_S, (now - last) / 1000);
    last = now;
    sinceFrame += dt;
    if (sinceFrame >= FRAME_EVERY_S) {
      motion.setFrame(options.frame());
      sinceFrame = 0;
    }
    avatar.render(motion.tick(dt));
    raf = requestAnimationFrame(loop);
  };
  const visibility = () => {
    cancelAnimationFrame(raf);
    last = 0;
    if (document.visibilityState === 'visible') raf = requestAnimationFrame(loop);
  };
  const lost = (event: Event) => {
    event.preventDefault();
    options.onLost();
  };
  document.addEventListener('visibilitychange', visibility);
  avatar.canvas.addEventListener('webglcontextlost', lost);
  visibility();
  return {
    cue: (cue) => motion.cue(cue),
    thinking: (on) => motion.setThinking(on),
    speak: (cues) => motion.speak(cues),
    sync: (charIndex) => motion.sync(charIndex),
    silence: () => motion.silence(),
    dispose() {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', visibility);
      avatar.canvas.removeEventListener('webglcontextlost', lost);
      observer.disconnect();
      avatar.canvas.remove();
      avatar.dispose();
    },
  };
}
