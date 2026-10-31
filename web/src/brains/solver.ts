import type { Card } from '../cards/index.ts';
import { getOptimal } from './adviceFromMap.ts';
import type { AggressionInfo, GameContext } from './handState.ts';
import { HandState, PREFLOP } from './handState.ts';
import { preflopStrengthVsSpectrum } from './preflopEquilator.ts';
import type { ActionDistribution, GameSolver, SolverRequest } from './profit.ts';
import { call, check, createBetAction, createRaiseAction, fold, RandomVariable } from './profit.ts';
import type { HoleCards } from './spectrum.ts';
import { Spectrum } from './spectrum.ts';
import { SpectrumEquilator } from './spectrumEquilator.ts';
import { randomAdvice } from './villainModel.ts';

const NEARLY_ZERO = 0.0001;
const DEFAULT_POSITIVE_POTENTIAL = 0.1;
const DEFAULT_NEGATIVE_POTENTIAL = 0.1;
const FIRST_BET_PERCENT = 0.75;

class AggressionInfoBuffer implements AggressionInfo {
  heroActionCount: number;
  villainActionCount: number;
  heroAggressionActionCount: number;
  villainAggressionActionCount: number;
  wasHeroPreviousAggressive: boolean;
  wasVillainPreviousAggressive: boolean;

  constructor(info: AggressionInfo) {
    this.heroActionCount = info.heroActionCount;
    this.villainActionCount = info.villainActionCount;
    this.heroAggressionActionCount = info.heroAggressionActionCount;
    this.villainAggressionActionCount = info.villainAggressionActionCount;
    this.wasHeroPreviousAggressive = info.wasHeroPreviousAggressive;
    this.wasVillainPreviousAggressive = info.wasVillainPreviousAggressive;
  }

  plusHeroAction(): this {
    this.heroActionCount++;
    return this;
  }

  plusHeroAggressiveAction(): this {
    this.heroAggressionActionCount++;
    return this;
  }

  plusVillainAction(aggressive: boolean): this {
    if (aggressive) {
      this.villainAggressionActionCount++;
    }
    this.villainActionCount++;
    return this;
  }
}

function raisePercent(toCall: number, street: number): number {
  return toCall !== 0 || street === PREFLOP ? 1 : FIRST_BET_PERCENT;
}

interface Hand {
  readonly game: GameContext;
  readonly hero: HoleCards;
  readonly board: readonly Card[];
  readonly street: number;
  readonly onButton: boolean;
}

interface SolverNode {
  readonly info: AggressionInfo;
  readonly effectiveStack: number;
  readonly pot: number;
  readonly heroInvestment: number;
  readonly spectrum: Spectrum;
}

interface HeroAction {
  readonly amount: number;
  readonly wasVillainPreviousAggressive: boolean;
  readonly wasHeroPreviousAggressive: boolean;
}

interface Showdown {
  readonly pot: number;
  readonly heroInvestment: number;
  readonly spectrum: Spectrum;
}

interface VillainResponse {
  readonly spectrum: Spectrum;
  readonly weight: number;
}

interface VillainResponses {
  readonly total: number;
  readonly fold: VillainResponse;
  readonly passive: VillainResponse;
  readonly aggressive: VillainResponse;
}

function villainSituationWithoutStrength(
  hand: Hand,
  node: SolverNode,
  action: HeroAction,
): HandState {
  const toCall = action.amount;
  const pot = node.pot;
  const effectiveStack = node.effectiveStack;
  const potOdds = toCall / (toCall + pot);
  const result = new HandState(hand.street);
  result.positivePotential = DEFAULT_POSITIVE_POTENTIAL;
  result.negativePotential = DEFAULT_NEGATIVE_POTENTIAL;
  result.setAggressionInfoOnlyCount(node.info, true);
  result.wasVillainPreviousAggressive = action.wasHeroPreviousAggressive;
  result.wasHeroPreviousAggressive = action.wasVillainPreviousAggressive;
  result.potOdds = potOdds;
  result.amountToCall = toCall;
  result.isHeroOnButton = !hand.onButton;
  result.potToStackOdds = (pot + toCall) / (pot + toCall + effectiveStack);
  result.canRaise = effectiveStack !== 0;
  return result;
}

function response(spectrum: Spectrum): VillainResponse {
  return { spectrum, weight: spectrum.summaryWeight() };
}

export class NLGameSolver implements GameSolver {
  private readonly equilator = new SpectrumEquilator();

  onFirstActionPreflop(request: SolverRequest, bigBlind: number): ActionDistribution {
    const hand = this.hand(request);
    const { info, effectiveStack, pot, spectrum } = request;
    const wasVillainPreviousAggressive = false;
    const result: ActionDistribution = [];
    result.push({ action: fold(), profit: RandomVariable.constant(0) });
    const toCall = bigBlind / 2;
    const callProfit = this.heroActionProfit(
      hand,
      { info, effectiveStack, pot: pot + toCall, heroInvestment: toCall, spectrum },
      { amount: 0, wasVillainPreviousAggressive, wasHeroPreviousAggressive: false },
    );
    result.push({ action: call(toCall), profit: callProfit });
    const raise = createRaiseAction(toCall, pot, effectiveStack, raisePercent(toCall, PREFLOP));
    const raiseAmount = raise.amount;
    const aggressiveProfit = this.heroActionProfit(
      hand,
      {
        info,
        effectiveStack: effectiveStack - raiseAmount,
        pot: pot + toCall + raiseAmount,
        heroInvestment: toCall + raiseAmount,
        spectrum,
      },
      { amount: raiseAmount, wasVillainPreviousAggressive, wasHeroPreviousAggressive: true },
    );
    result.push({ action: raise, profit: aggressiveProfit });
    return result;
  }

  onFirstAction(request: SolverRequest, wasVillainPreviousAggressive: boolean): ActionDistribution {
    const hand = this.hand(request);
    const { info, effectiveStack, pot, spectrum } = request;
    const result: ActionDistribution = [];
    result.push({ action: fold(), profit: RandomVariable.constant(0) });
    const checkProfit = this.heroActionProfit(
      hand,
      { info, effectiveStack, pot, heroInvestment: 0, spectrum },
      { amount: 0, wasVillainPreviousAggressive, wasHeroPreviousAggressive: false },
    );
    result.push({ action: check(), profit: checkProfit });
    const bet = createBetAction(pot, effectiveStack, FIRST_BET_PERCENT);
    const betAmount = bet.amount;
    const aggressiveProfit = this.heroActionProfit(
      hand,
      {
        info,
        effectiveStack: effectiveStack - betAmount,
        pot: pot + betAmount,
        heroInvestment: betAmount,
        spectrum,
      },
      { amount: betAmount, wasVillainPreviousAggressive, wasHeroPreviousAggressive: true },
    );
    result.push({ action: bet, profit: aggressiveProfit });
    return result;
  }

  onSecondAction(request: SolverRequest, toCall: number): ActionDistribution {
    const hand = this.hand(request);
    const { info, effectiveStack, pot, spectrum } = request;
    return this.secondActionRecursive(
      hand,
      { info, effectiveStack, pot, heroInvestment: 0, spectrum },
      toCall,
    );
  }

  private calculatePassiveProfit(hand: Hand, showdown: Showdown): RandomVariable {
    const street = hand.street;
    const previousStreetPot = street !== PREFLOP ? hand.game.potOnStreet(street - 1) : 0;
    const win = showdown.pot - showdown.heroInvestment - previousStreetPot;
    const lose = showdown.heroInvestment;
    const strength =
      hand.board.length > 0
        ? this.equilator.strengthVsSpectrum(hand.hero, hand.board, showdown.spectrum)
        : preflopStrengthVsSpectrum(hand.hero, showdown.spectrum);
    const result = new RandomVariable();
    result.add(strength, win);
    result.add(1 - strength, -lose);
    return result;
  }

  private hand({ game, hero, isHeroOnButton: onButton }: SolverRequest): Hand {
    return { game, hero, board: [...game.board], street: game.street, onButton };
  }

  private secondActionRecursive(hand: Hand, node: SolverNode, toCall: number): ActionDistribution {
    const result: ActionDistribution = [];
    result.push({ action: fold(), profit: RandomVariable.constant(-node.heroInvestment) });
    const passiveProfit = this.calculatePassiveProfit(hand, {
      pot: node.pot + toCall,
      heroInvestment: node.heroInvestment + toCall,
      spectrum: node.spectrum,
    });
    result.push({ action: call(toCall), profit: passiveProfit });
    if (node.effectiveStack === 0) {
      return result;
    }
    const raise = createRaiseAction(
      toCall,
      node.pot,
      node.effectiveStack,
      raisePercent(toCall, hand.street),
    );
    const amount = raise.amount;
    const aggressiveProfit = this.heroActionProfit(
      hand,
      {
        info: node.info,
        effectiveStack: node.effectiveStack - amount,
        pot: node.pot + toCall + amount,
        heroInvestment: node.heroInvestment + toCall + amount,
        spectrum: node.spectrum,
      },
      { amount, wasVillainPreviousAggressive: toCall !== 0, wasHeroPreviousAggressive: true },
    );
    result.push({ action: raise, profit: aggressiveProfit });
    return result;
  }

  private heroActionProfit(hand: Hand, node: SolverNode, action: HeroAction): RandomVariable {
    const result = new RandomVariable();
    const villainToCall = action.amount;
    const info = new AggressionInfoBuffer(node.info).plusHeroAction();
    if (action.wasHeroPreviousAggressive) {
      info.plusHeroAggressiveAction();
    }
    const villainSituation = villainSituationWithoutStrength(hand, { ...node, info }, action);
    const responses = this.villainResponses(node.spectrum, villainSituation);
    result.add(responses.fold.weight / responses.total, node.pot - node.heroInvestment);
    if (!responses.passive.spectrum.isEmpty()) {
      const passiveActionChance = responses.passive.weight / responses.total;
      const ifVillainPassiveProfit = this.calculatePassiveProfit(hand, {
        pot: node.pot + villainToCall,
        heroInvestment: node.heroInvestment,
        spectrum: responses.passive.spectrum,
      });
      result.addVariable(passiveActionChance, ifVillainPassiveProfit);
    }
    if (responses.aggressive.spectrum.isEmpty()) {
      return result;
    }
    const aggressiveChance = responses.aggressive.weight / responses.total;
    info.plusVillainAction(true);
    const ifVillainAggressiveProfit = this.ifVillainRaises(
      hand,
      { ...node, info, spectrum: responses.aggressive.spectrum },
      villainToCall,
    );
    result.addVariable(aggressiveChance, ifVillainAggressiveProfit);
    return result;
  }

  private ifVillainRaises(hand: Hand, node: SolverNode, villainToCall: number): RandomVariable {
    const villainRaise = createRaiseAction(
      villainToCall,
      node.pot,
      node.effectiveStack,
      raisePercent(villainToCall, hand.street),
    );
    const villainRaiseAmount = villainRaise.amount;
    const distribution = this.secondActionRecursive(
      hand,
      {
        info: node.info,
        effectiveStack: node.effectiveStack - villainRaiseAmount,
        pot: node.pot + villainToCall + villainRaiseAmount,
        heroInvestment: node.heroInvestment,
        spectrum: node.spectrum,
      },
      villainRaiseAmount,
    );
    return getOptimal(distribution, hand.game);
  }

  private villainResponses(spectrum: Spectrum, villainSituation: HandState): VillainResponses {
    const foldSpectrum = Spectrum.empty();
    const passiveSpectrum = Spectrum.empty();
    const aggressiveSpectrum = Spectrum.empty();
    const advice = randomAdvice(villainSituation);
    for (const { cards, weight } of spectrum.entries()) {
      foldSpectrum.add(cards, weight * advice.fold);
      passiveSpectrum.add(cards, weight * advice.passive);
      aggressiveSpectrum.add(cards, weight * advice.aggressive);
    }
    const responses: VillainResponses = {
      total: spectrum.summaryWeight(),
      fold: response(foldSpectrum),
      passive: response(passiveSpectrum),
      aggressive: response(aggressiveSpectrum),
    };
    const sum = responses.fold.weight + responses.passive.weight + responses.aggressive.weight;
    if (Math.abs(sum - responses.total) > NEARLY_ZERO) {
      throw new Error(
        `Equities must be equal in summary: fold ${responses.fold.weight}, call ${responses.passive.weight}, raise ${responses.aggressive.weight}, summary ${responses.total}`,
      );
    }
    return responses;
  }
}
