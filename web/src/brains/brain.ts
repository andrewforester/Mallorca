import type { Action, LegalActions } from '../engine/index.ts';
import { lessVarianceAction } from './adviceFromMap.ts';
import { GameContext, HandStateObserver } from './handState.ts';
import type { Observation } from './observation.ts';
import { preprocessAction, toLegalAction } from './preprocess.ts';
import type { ActionDistribution, SolverActionType } from './profit.ts';
import { profitMap } from './profit.ts';
import { NLGameSolver } from './solver.ts';
import { VillainSpectrumTracker } from './villainModel.ts';

export interface Breakdown {
  moves: Action[];
  base: number[];
  biased: number[];
  chosen: number;
}

export interface Decision {
  action: Action;
  solverChoice: SolverActionType;
  evByAction: { fold: number; passive: number; aggressive: number };
  breakdown?: Breakdown;
}

export interface BotBias {
  aggression: number;
  bluff: number;
  tightness: number;
  sizing: number;
  stickiness: number;
}

export interface Brain {
  observe(o: Observation): void;
  decide(legal: LegalActions): Decision;
  setBias?(bias: BotBias): void;
  explain?(): Breakdown | null;
  dispose?(): void;
}

function evOf(distribution: ActionDistribution, type: SolverActionType): number {
  const entry = distribution.find(({ action }) => action.type === type);
  return entry === undefined ? Number.NEGATIVE_INFINITY : entry.profit.getEV();
}

class MathBrain implements Brain {
  private readonly tracker = new VillainSpectrumTracker();
  private readonly heroState = new HandStateObserver(true);
  private readonly game = new GameContext();
  private readonly solver = new NLGameSolver();

  observe(o: Observation): void {
    this.heroState.observe(o);
    this.tracker.observe(o);
    this.game.observe(o);
  }

  decide(legal: LegalActions): Decision {
    const hero = this.game.heroCards;
    if (hero === undefined) {
      throw new Error('The brain has not seen its hole cards');
    }
    const situation = this.heroState.situation();
    const distribution = profitMap(this.solver, this.game, situation, {
      hero,
      spectrum: this.tracker.spectrum,
    });
    const advice = lessVarianceAction(distribution, this.game);
    const action = preprocessAction(advice, this.game, situation.amountToCall);
    return {
      action: toLegalAction(action, legal, this.game.bet('villain')),
      solverChoice: advice.type,
      evByAction: {
        fold: evOf(distribution, 'fold'),
        passive: evOf(distribution, 'passive'),
        aggressive: evOf(distribution, 'aggressive'),
      },
    };
  }
}

export function createMathBrain(): Brain {
  return new MathBrain();
}
