import type { Card } from '../cards/index.ts';
import { fullDeck } from '../cards/index.ts';
import type { BoardSize } from '../engine/index.ts';
import { pheEvaluator } from '../equity/index.ts';
import { holeCardsHash } from './javaCard.ts';
import type { HoleCards, Spectrum } from './spectrum.ts';

const FLOP_SIZE: BoardSize['flop'] = 3;
const TURN_SIZE: BoardSize['turn'] = 4;

interface Outcomes {
  wins: number;
  draws: number;
  count: number;
}

export class SpectrumEquilator {
  private key = '';
  private readonly outcomes = new Map<number, Outcomes>();
  private heroRanks: number[] = [];
  private runouts: Card[][] = [];

  strengthVsSpectrum(hero: HoleCards, board: readonly Card[], spectrum: Spectrum): number {
    if (board.length < FLOP_SIZE) {
      throw new Error('Cannot calculate for empty board');
    }
    this.prepare(hero, board);
    let count = 0;
    let wins = 0;
    let draw = 0;
    for (const { cards, weight } of spectrum.entries()) {
      if (hero.includes(cards[0]) || hero.includes(cards[1])) {
        continue;
      }
      if (board.includes(cards[0]) || board.includes(cards[1])) {
        continue;
      }
      const outcome = this.outcomesOf(cards, board.length);
      for (let i = 0; i < outcome.wins; i++) {
        wins += weight;
      }
      for (let i = 0; i < outcome.draws; i++) {
        draw += weight;
      }
      for (let i = 0; i < outcome.count; i++) {
        count += weight;
      }
    }
    return (draw / 2 + wins) / count;
  }

  private prepare(hero: HoleCards, board: readonly Card[]): void {
    const key = [...hero, ...board].join(',');
    if (key === this.key) {
      return;
    }
    this.key = key;
    this.outcomes.clear();
    const live = fullDeck().filter((card) => !hero.includes(card) && !board.includes(card));
    this.runouts = [];
    if (board.length === FLOP_SIZE) {
      for (let t = 0; t < live.length; t++) {
        for (let r = t + 1; r < live.length; r++) {
          this.runouts.push([...board, live[t] as Card, live[r] as Card]);
        }
      }
    } else if (board.length === TURN_SIZE) {
      this.runouts = live.map((card) => [...board, card]);
    } else {
      this.runouts = [[...board]];
    }
    this.heroRanks = this.runouts.map((runout) => pheEvaluator.rank([...hero, ...runout]));
  }

  private outcomesOf(cards: HoleCards, boardSize: number): Outcomes {
    const hash = holeCardsHash(cards[0], cards[1]);
    let result = this.outcomes.get(hash);
    if (result !== undefined) {
      return result;
    }
    const repeats = boardSize === FLOP_SIZE ? 2 : 1;
    const [first, second] = cards;
    const villain: Card[] = [first, second, 0, 0, 0, 0, 0];
    let wins = 0;
    let draws = 0;
    let count = 0;
    for (let b = 0; b < this.runouts.length; b++) {
      const runout = this.runouts[b] as Card[];
      let blocked = false;
      for (let i = boardSize; i < runout.length; i++) {
        const card = runout[i] as Card;
        blocked ||= card === first || card === second;
        villain[i + 2] = card;
      }
      if (blocked) {
        continue;
      }
      for (let i = 0; i < boardSize; i++) {
        villain[i + 2] = runout[i] as Card;
      }
      villain.length = runout.length + 2;
      const villainRank = pheEvaluator.rank(villain);
      const heroRank = this.heroRanks[b] as number;
      if (heroRank > villainRank) {
        wins += repeats;
      } else if (heroRank === villainRank) {
        draws += repeats;
      }
      count += repeats;
    }
    result = { wins, draws, count };
    this.outcomes.set(hash, result);
    return result;
  }
}
