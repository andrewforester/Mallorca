import type { SeatIndex, ViewModel } from '../game/index.ts';
import { t } from './i18n.ts';
import { handName } from './phrases.ts';

export interface ResultPillProps {
  vm: ViewModel;
  humanSeat: SeatIndex;
  text: string;
}

type Result = NonNullable<ViewModel['result']>;

function kind(result: Result, humanSeat: SeatIndex): 'you' | 'her' | 'split' {
  if (result.winner === null) {
    return 'split';
  }
  return result.winner === humanSeat ? 'you' : 'her';
}

function detail(vm: ViewModel, result: Result): string {
  const hand = result.category === null ? null : handName(result.category);
  if (result.winner === null) {
    return hand === null ? t('result.pill.split') : t('result.pill.splitWith', { hand });
  }
  return hand ?? vm.seats[result.winner].name;
}

export function ResultPill({ vm, humanSeat, text }: ResultPillProps) {
  const result = vm.result;
  if (result === null) {
    return null;
  }
  const split = result.winner === null;
  return (
    <div class={`result-pill result-pill-${kind(result, humanSeat)}`} data-testid="result">
      <span class="result-amount" aria-hidden="true">
        {t(split ? 'result.pill.each' : 'result.pill.won', { amount: result.amount })}
      </span>
      <span class="result-detail" aria-hidden="true">
        {detail(vm, result)}
      </span>
      <span class="visually-hidden">{text}</span>
    </div>
  );
}
