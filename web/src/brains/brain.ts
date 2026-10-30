import type { Action, LegalActions } from '../engine/index.ts';
import type { AdviceCreatorFromMap } from './adviceFromMap.ts';
import { LessVarianceActionFromMap } from './adviceFromMap.ts';
import { GameContext, HandStateObserver } from './handState.ts';
import type { Observation } from './observation.ts';
import { preprocessAction, toLegalAction } from './preprocess.ts';
import type { ActionDistribution, GameSolver, SolverActionType } from './profit.ts';
import { profitMap } from './profit.ts';
import { NLGameSolver } from './solver.ts';
import { StrengthManager } from './strength.ts';
import type { VillainModel } from './villainModel.ts';
import { VillainSpectrumTracker } from './villainModel.ts';

export interface Decision {
  action: Action;
  solverChoice: SolverActionType;
  evByAction: { fold: number; passive: number; aggressive: number };
}

export interface BotStyle {
  aggression: number;
  bluff: number;
  tightness: number;
}

export interface Brain {
  observe(o: Observation): void;
  decide(legal: LegalActions): Decision;
  setStyle?(style: BotStyle): void;
}

export interface MathBrainOptions {
  villainModel: VillainModel;
}

function evOf(distribution: ActionDistribution, type: SolverActionType): number {
  const entry = distribution.find(({ action }) => action.type === type);
  return entry === undefined ? Number.NEGATIVE_INFINITY : entry.profit.getEV();
}

class MathBrain implements Brain {
  private readonly strength = new StrengthManager();
  private readonly tracker: VillainSpectrumTracker;
  private readonly heroState = new HandStateObserver(true);
  private readonly game = new GameContext();
  private readonly solver: GameSolver;
  private readonly adviceCreator: AdviceCreatorFromMap = new LessVarianceActionFromMap();

  constructor(villainModel: VillainModel) {
    this.tracker = new VillainSpectrumTracker(villainModel, this.strength);
    this.solver = new NLGameSolver(villainModel);
  }

  observe(o: Observation): void {
    this.heroState.observe(o);
    this.strength.observe(o);
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
      strength: this.strength,
    });
    const advice = this.adviceCreator.create(distribution, this.game);
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

export function createMathBrain(options: MathBrainOptions): Brain {
  return new MathBrain(options.villainModel);
}
