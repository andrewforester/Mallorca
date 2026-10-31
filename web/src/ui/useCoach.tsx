import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Phase, Session, SessionState } from '../game/index.ts';
import { Coach } from './Coach.tsx';
import { CoachSheet } from './CoachSheet.tsx';
import type { Preferences } from './usePreferences.ts';
import { useWide } from './useWide.ts';

export interface CoachView {
  panel: ComponentChildren;
  sheet: ComponentChildren;
  toggle: { open: boolean; onToggle: () => void } | null;
}

function ended(phase: Phase): boolean {
  return phase === 'idle' || phase === 'sessionOver' || phase === 'tournamentOver';
}

export function useCoach(
  session: Session,
  state: SessionState,
  preferences: Preferences,
): CoachView {
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const on = preferences.coach;
  useEffect(() => {
    session.getState().setCoach(on);
  }, [session, on]);
  const close = useCallback(() => setOpen(false), []);
  const narrow = on && !wide && !ended(state.phase);
  return {
    panel: on && wide ? <Coach state={state.coach} /> : null,
    sheet: narrow && open ? <CoachSheet state={state.coach} onClose={close} /> : null,
    toggle: narrow ? { open, onToggle: () => setOpen(!open) } : null,
  };
}
