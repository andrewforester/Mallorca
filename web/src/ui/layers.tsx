import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Phase, SeatIndex, Session, SessionState, ViewModel } from '../game/index.ts';
import { TalkLayer } from './ChatSheet.tsx';
import { HandLogDrawer } from './HandLogDrawer.tsx';
import type { CoachView } from './useCoach.tsx';

export function useLogDrawer(phase: Phase) {
  const [open, setOpen] = useState(false);
  const ended = phase === 'idle' || phase === 'sessionOver' || phase === 'tournamentOver';
  useEffect(() => {
    if (ended) {
      setOpen(false);
    }
  }, [ended]);
  const toggle = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    toggle.current?.focus();
  }, []);
  const flip = useCallback(() => (open ? close() : setOpen(true)), [open, close]);
  const dismiss = useCallback(() => setOpen(false), []);
  return { open: open && !ended, toggle, close, flip, dismiss };
}

export type LogDrawer = ReturnType<typeof useLogDrawer>;

export function useTalk(vm: ViewModel | null, onOpen: () => void) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const available = vm !== null && vm.conversation.available && vm.conversation.on;
  const close = useCallback(() => {
    setOpen(false);
    button.current?.focus();
  }, []);
  const toggle = () => {
    if (open) {
      close();
      return;
    }
    onOpen();
    setOpen(true);
  };
  return { available, open: open && available, button, close, toggle };
}

export type Talk = ReturnType<typeof useTalk>;

export interface LayerProps {
  session: Session;
  state: SessionState;
  vm: ViewModel;
  humanSeat: SeatIndex;
  open: { drawer: LogDrawer; talk: Talk; coach: CoachView };
}

export function tableLayer(props: LayerProps): {
  layer: ComponentChildren;
  kind: 'log' | 'talk' | 'coach';
} {
  const { session, state, vm, humanSeat, open } = props;
  if (open.drawer.open) {
    const names: [string, string] = [vm.seats[0].name, vm.seats[1].name];
    return {
      kind: 'log',
      layer: (
        <HandLogDrawer
          entries={state.log}
          names={names}
          humanSeat={humanSeat}
          onClose={open.drawer.close}
        />
      ),
    };
  }
  if (open.talk.open) {
    return {
      kind: 'talk',
      layer: (
        <TalkLayer
          lines={vm.conversation.lines}
          onSay={(text) => session.getState().say(text)}
          onQuick={(id, text) => session.getState().quick(id, text)}
          onClose={open.talk.close}
        />
      ),
    };
  }
  return { kind: 'coach', layer: open.coach.sheet ?? undefined };
}
