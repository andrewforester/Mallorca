import type { Card } from '../cards/index.ts';
import type { Action } from '../engine/index.ts';
import type { HandState } from './handState.ts';
import { HandStateObserver } from './handState.ts';
import type { Observation } from './observation.ts';
import { Spectrum } from './spectrum.ts';

export interface Advice {
  fold: number;
  passive: number;
  aggressive: number;
}

const FACING_BET: Advice = { fold: 1 / 3, passive: 1 / 3, aggressive: 1 / 3 };
const NOT_FACING_BET: Advice = { fold: 0, passive: 0.5, aggressive: 0.5 };

export function randomAdvice(state: HandState): Advice {
  return { ...(state.amountToCall > 0 ? FACING_BET : NOT_FACING_BET) };
}

function probabilityOf(advice: Advice, action: Action): number {
  if (action.kind === 'fold') {
    return advice.fold;
  }
  return action.kind === 'raise' ? advice.aggressive : advice.passive;
}

export class VillainSpectrumTracker {
  private readonly stateObserver = new HandStateObserver(false);
  private current = Spectrum.random();
  private randomSpectrum = Spectrum.random();
  private handState: HandState | undefined;
  private board: Card[] = [];

  get spectrum(): Spectrum {
    return this.current;
  }

  observe(o: Observation): void {
    switch (o.type) {
      case 'handStarted':
        this.stateObserver.observe(o);
        this.handState = o.heroOnButton ? undefined : this.stateObserver.situation();
        this.current = Spectrum.random();
        this.randomSpectrum = Spectrum.random();
        this.board = [];
        break;
      case 'holeCards':
        this.stateObserver.observe(o);
        this.current.remove(...o.cards);
        this.randomSpectrum.remove(...o.cards);
        break;
      case 'street': {
        this.stateObserver.observe(o);
        this.handState = this.stateObserver.situation();
        const dealt = o.board.slice(this.board.length);
        this.current.remove(...dealt);
        this.randomSpectrum.remove(...dealt);
        this.board = [...o.board];
        break;
      }
      case 'acted': {
        const before = this.handState ?? this.stateObserver.situation();
        this.stateObserver.observe(o);
        if (o.who === 'villain') {
          this.modifySpectrum(before, o.action);
        } else if (o.action.kind !== 'fold') {
          this.handState = this.stateObserver.situation();
        }
        break;
      }
    }
  }

  private modifySpectrum(state: HandState, action: Action): void {
    const percent = probabilityOf(randomAdvice(state), action);
    for (const cards of this.current.hands()) {
      if (percent === 0) {
        this.current.removeHand(cards);
      } else {
        this.current.add(cards, percent * this.current.weight(cards));
      }
    }
    if (this.current.isEmpty()) {
      this.current = this.randomSpectrum;
    }
  }
}
