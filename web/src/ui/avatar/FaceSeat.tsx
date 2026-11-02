import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { speechOf } from '../../game/index.ts';
import type { ChatLine, FaceCue, Session } from '../../game/index.ts';
import { t } from '../i18n.ts';
import { canRender } from './canRender.ts';
import type { LiveFace } from './live.ts';
import { createVoice } from './voice.ts';
import type { Voice } from './voice.ts';

export const MODEL_URL = `${import.meta.env.BASE_URL}avatar/mallorca.glb`;
export const PORTRAIT_URL = `${import.meta.env.BASE_URL}avatar/portrait.webp`;

export interface FaceSeatProps {
  session: Session;
  cues: FaceCue[];
  thinking: boolean;
  line: ChatLine | null;
  voice: boolean;
}

type Mode = 'portrait' | 'live';

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function useLive(host: RefObject<HTMLDivElement | null>, session: Session) {
  const [mode, setMode] = useState<Mode>('portrait');
  const live = useRef<LiveFace | null>(null);
  useEffect(() => {
    const node = host.current;
    if (node === null || !canRender()) return undefined;
    let gone = false;
    const drop = () => {
      live.current?.dispose();
      live.current = null;
      setMode('portrait');
    };
    import('./live.ts')
      .then(({ mountFace }) =>
        mountFace(node, {
          url: MODEL_URL,
          frame: () => session.getState().faceNow(),
          calm: reducedMotion(),
          onLost: drop,
        }),
      )
      .then((face) => {
        if (gone) return face.dispose();
        live.current = face;
        setMode('live');
      })
      .catch(() => setMode('portrait'));
    return () => {
      gone = true;
      live.current?.dispose();
      live.current = null;
    };
  }, [host, session]);
  return { mode, live };
}

function useCues(live: RefObject<LiveFace | null>, cues: FaceCue[]) {
  const seen = useRef(cues.at(-1)?.id ?? 0);
  useEffect(() => {
    for (const cue of cues) {
      if (cue.id > seen.current) live.current?.cue(cue);
    }
    seen.current = Math.max(seen.current, cues.at(-1)?.id ?? 0);
  }, [cues, live]);
}

function useSpeech(props: FaceSeatProps, live: RefObject<LiveFace | null>) {
  const { line, voice, session } = props;
  const said = useRef(line?.id ?? 0);
  const speaker = useRef<Voice | null>(null);
  useEffect(() => {
    if (line === null || line.id <= said.current) return;
    said.current = line.id;
    const prosody = session.getState().faceNow()?.prosody ?? { rate: 1, pitch: 1, volume: 1 };
    live.current?.speak(speechOf(line.text, prosody));
    if (!voice) return;
    speaker.current ??= createVoice();
    speaker.current?.speak(line.text, prosody, (i) => live.current?.sync(i));
  }, [line, voice, session, live]);
  useEffect(() => {
    if (!voice) speaker.current?.stop();
  }, [voice]);
  useEffect(() => () => speaker.current?.stop(), []);
}

export function FaceSeat(props: FaceSeatProps) {
  const host = useRef<HTMLDivElement>(null);
  const { mode, live } = useLive(host, props.session);
  useCues(live, props.cues);
  useSpeech(props, live);
  useEffect(() => {
    live.current?.thinking(props.thinking);
  }, [props.thinking, mode, live]);
  return (
    <div class={`face-seat face-mode-${mode}`} data-testid="face-seat" data-face={mode}>
      <img class="face-portrait" src={PORTRAIT_URL} alt={t('seat.bot')} draggable={false} />
      <div class="face-stage" ref={host} />
    </div>
  );
}
