import type { GameContext } from './handState.ts';
import type {
  ActionDistribution,
  ActionProfitEntry,
  RandomVariable,
  SolverAction,
} from './profit.ts';

class ActionProfit {
  evBBKoeff = 0;
  evVarKoeff = 0;
  varBBKoeff = 0;
  ev = 0;
  variance = 0;

  calculate(bb: number): void {
    this.evBBKoeff = this.ev / bb;
    this.varBBKoeff = this.variance / bb;
    this.evVarKoeff = this.ev / this.variance;
  }

  calculateEVVarChanged(bb: number): void {
    this.ev = this.evVarKoeff * this.variance;
    this.evBBKoeff = this.ev / bb;
    this.varBBKoeff = this.variance / bb;
  }
}

const PROFITABLE_EV_VAR_ABOVE_VAR_BB_BELOW: readonly (readonly [number, number])[] = [
  [0.1, 2],
  [0.2, 5],
  [0.25, 10],
  [0.3, 25],
  [0.4, 30],
  [0.48, 38],
  [0.5, 40],
  [0.55, 50],
  [0.75, 100],
];

function profitabilityIsGood(actionProfit: ActionProfit, lowEV: number): boolean {
  if (actionProfit.evBBKoeff < lowEV) {
    return false;
  }
  const evVar = actionProfit.evVarKoeff;
  const varBB = actionProfit.varBBKoeff;
  if (evVar >= 0 && varBB <= 0) {
    return true;
  }
  return PROFITABLE_EV_VAR_ABOVE_VAR_BB_BELOW.some(
    ([minEvVar, maxVarBB]) => evVar > minEvVar && varBB < maxVarBB,
  );
}

interface ScoredAction {
  readonly entry: ActionProfitEntry;
  readonly profit: ActionProfit;
}

interface ScoredDistribution {
  fold: ScoredAction | null;
  passive: ScoredAction | null;
  raise: ScoredAction | null;
  toCall: number;
}

interface CompleteDistribution {
  readonly fold: ScoredAction;
  readonly passive: ScoredAction;
  readonly raise: ScoredAction | null;
  readonly toCall: number;
}

function scoreDistribution(distribution: ActionDistribution, bb: number): ScoredDistribution {
  const scored: ScoredDistribution = { fold: null, passive: null, raise: null, toCall: -1 };
  for (const entry of distribution) {
    const profit = new ActionProfit();
    if (entry.action.type === 'fold') {
      scored.fold = { entry, profit };
    } else if (entry.action.type === 'passive') {
      scored.toCall = entry.action.toCall;
      scored.passive = { entry, profit };
    } else {
      scored.raise = { entry, profit };
    }
    profit.variance = entry.profit.getVariance();
    profit.ev = entry.profit.getEV();
    profit.calculate(bb);
  }
  return scored;
}

function completed(scored: ScoredDistribution): CompleteDistribution {
  const { fold, passive, raise, toCall } = scored;
  if (toCall === -1 || passive === null) {
    throw new Error('toCall cannot be -1 in this state');
  }
  if (fold === null) {
    throw new Error('The profit map has no fold');
  }
  return { fold, passive, raise, toCall };
}

function recomputeProfits(game: GameContext, scored: CompleteDistribution): void {
  const bb = game.bigBlind;
  scored.raise?.profit.calculateEVVarChanged(bb);
  scored.passive.profit.calculateEVVarChanged(bb);
}

function bestAction(
  distribution: ActionDistribution,
  game: GameContext,
  fromTop: boolean,
): ActionProfitEntry {
  const scored = completed(scoreDistribution(distribution, game.bigBlind));
  if (fromTop) {
    recomputeProfits(game, scored);
  }
  const lowEV = scored.fold.profit.evBBKoeff;
  if (scored.raise !== null && profitabilityIsGood(scored.raise.profit, lowEV)) {
    return scored.raise.entry;
  }
  if (profitabilityIsGood(scored.passive.profit, lowEV) || scored.toCall === 0) {
    return scored.passive.entry;
  }
  return scored.fold.entry;
}

export function getOptimal(distribution: ActionDistribution, game: GameContext): RandomVariable {
  return bestAction(distribution, game, false).profit;
}

export function lessVarianceAction(
  distribution: ActionDistribution,
  game: GameContext,
): SolverAction {
  return bestAction(distribution, game, true).action;
}
