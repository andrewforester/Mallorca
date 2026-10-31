import type { ChatSignal, Pad } from '../../../src/emotion/index.ts';
import type { GazeTarget } from '../face/avatar.ts';

export interface Hand {
  hero: string;
  villain: string | null;
  board: readonly [string, string, string];
  stackBb?: number;
  line?: readonly string[];
}

export type Beat =
  | { at: number; do: 'deal'; hand?: number; potBb?: number; investedBb?: number }
  | { at: number; do: 'street'; street: 'flop' | 'turn' | 'river' }
  | { at: number; do: 'pot'; potBb: number; investedBb: number }
  | { at: number; do: 'reveal' }
  | { at: number; do: 'oppBet'; sizeBb: number; potBb: number; raise?: boolean }
  | { at: number; do: 'narrow'; after: number }
  | { at: number; do: 'result'; netBb: number; lastEquity?: number }
  | { at: number; do: 'bluff'; succeeded: boolean }
  | { at: number; do: 'mistake'; costBb: number }
  | { at: number; do: 'player'; text: string; signal?: ChatSignal }
  | { at: number; do: 'say'; text: string }
  | { at: number; do: 'gaze'; target: GazeTarget }
  | { at: number; do: 'effort'; effort: number; acted?: Pad | null }
  | { at: number; do: 'head'; kind: 'shake' | 'nod' | 'tilt'; amp: number; dur: number }
  | { at: number; do: 'gesture'; face: string; amp: number };

export interface Scene {
  id: string;
  title: string;
  hint: string;
  watch: string;
  length: number;
  moment: number;
  hands: readonly Hand[];
  beats: readonly Beat[];
}

const CONFIDENT: Pad = [0.2, 0, 0.6];

export const SCENES: readonly Scene[] = [
  {
    id: 'badbeat',
    title: 'Бэд-бит',
    hint: 'Тузы, ол-ин на тёрне, соперник собирает стрит на ривере',
    watch:
      'Эквити растёт до 92% на флопе, надежда растёт вместе с банком. Соперник вскрывает J♠T♠ с гатшотом на стрит, у неё 91%. Ривер Q♥, одна из четырёх карт, ломает всё: удивление, несправедливость (проиграла с 91%), огорчение. Перегрузка в основном от несправедливости.',
    length: 15,
    moment: 9.0,
    hands: [{ hero: 'As Ah', villain: 'Js Ts', board: ['Kc 9d 2s', '3h', 'Qh'] }],
    beats: [
      { at: 0, do: 'deal', potBb: 6, investedBb: 3 },
      { at: 0, do: 'gaze', target: 'cards' },
      { at: 1.2, do: 'gaze', target: 'player' },
      { at: 1.8, do: 'street', street: 'flop' },
      { at: 1.8, do: 'gaze', target: 'board' },
      { at: 2.8, do: 'pot', potBb: 18, investedBb: 9 },
      { at: 3.6, do: 'street', street: 'turn' },
      { at: 4.4, do: 'gaze', target: 'player' },
      { at: 4.6, do: 'say', text: 'All in.' },
      { at: 4.6, do: 'pot', potBb: 69, investedBb: 60 },
      { at: 5.8, do: 'player', text: 'Call.' },
      { at: 5.8, do: 'pot', potBb: 120, investedBb: 60 },
      { at: 6.2, do: 'reveal' },
      { at: 6.2, do: 'gaze', target: 'board' },
      { at: 8.0, do: 'street', street: 'river' },
      { at: 8.4, do: 'result', netBb: -60 },
      { at: 9.2, do: 'gesture', face: 'sigh', amp: 0.9 },
      { at: 9.2, do: 'head', kind: 'shake', amp: 0.09, dur: 1.4 },
      { at: 9.2, do: 'gaze', target: 'away' },
      { at: 10.8, do: 'gaze', target: 'player' },
      { at: 11, do: 'say', text: 'Four outs. Of course he hits.' },
      { at: 13.5, do: 'gaze', target: 'chips' },
    ],
  },
  {
    id: 'cooler',
    title: 'Кулер',
    hint: 'Сет против старшего сета: удар приходит при вскрытии',
    watch:
      'Сравните с бэд-битом. Она флопает сет и уверена (около 90% против случайной руки). Вскрытие K♦K♠ сразу роняет эквити до нескольких процентов: удар и страх приходят здесь, а к риверу шансов уже нет. Поэтому несправедливости почти нет, только огорчение.',
    length: 12.5,
    moment: 6.0,
    hands: [{ hero: '9s 9h', villain: 'Kd Ks', board: ['Kc 9d 2h', '5s', '3c'] }],
    beats: [
      { at: 0, do: 'deal', potBb: 6, investedBb: 3 },
      { at: 0, do: 'gaze', target: 'cards' },
      { at: 1.6, do: 'street', street: 'flop' },
      { at: 1.6, do: 'gaze', target: 'board' },
      { at: 2.6, do: 'pot', potBb: 18, investedBb: 9 },
      { at: 3.6, do: 'gaze', target: 'player' },
      { at: 3.8, do: 'say', text: 'All in.' },
      { at: 3.8, do: 'pot', potBb: 89, investedBb: 80 },
      { at: 4.8, do: 'player', text: 'Call.' },
      { at: 4.8, do: 'pot', potBb: 160, investedBb: 80 },
      { at: 5.4, do: 'reveal' },
      { at: 5.4, do: 'gaze', target: 'board' },
      { at: 7, do: 'street', street: 'turn' },
      { at: 8.2, do: 'street', street: 'river' },
      { at: 8.6, do: 'result', netBb: -80 },
      { at: 9.6, do: 'gaze', target: 'player' },
      { at: 9.8, do: 'say', text: 'Set over set. Nothing to do there.' },
    ],
  },
  {
    id: 'bigpot',
    title: 'Большой банк',
    hint: 'Короли против дам, ол-ин на префлопе, короли держат',
    watch:
      'Пока открываются карты, держится страх проиграть 50 бб (эквити около 82%). После победы страх превращается в облегчение, к нему добавляется радость. У Лолы это смех, у Ингрид почти ничего.',
    length: 11.5,
    moment: 7.6,
    hands: [{ hero: 'Kh Ks', villain: 'Qd Qc', board: ['7s 4d 2c', 'Jh', '3s'] }],
    beats: [
      { at: 0, do: 'deal', potBb: 3, investedBb: 1.5 },
      { at: 0, do: 'gaze', target: 'cards' },
      { at: 1, do: 'gaze', target: 'player' },
      { at: 1.2, do: 'say', text: 'All in.' },
      { at: 1.2, do: 'pot', potBb: 51.5, investedBb: 50 },
      { at: 2.2, do: 'player', text: 'Call.' },
      { at: 2.2, do: 'pot', potBb: 100, investedBb: 50 },
      { at: 2.6, do: 'reveal' },
      { at: 2.6, do: 'gaze', target: 'board' },
      { at: 3.8, do: 'street', street: 'flop' },
      { at: 5.2, do: 'street', street: 'turn' },
      { at: 6.6, do: 'street', street: 'river' },
      { at: 7, do: 'result', netBb: 50 },
      { at: 7.6, do: 'head', kind: 'nod', amp: 0.07, dur: 0.9 },
      { at: 8.2, do: 'gaze', target: 'player' },
      { at: 8.4, do: 'say', text: "That one I'll remember." },
      { at: 10.2, do: 'gaze', target: 'chips' },
    ],
  },
  {
    id: 'suckout',
    title: 'Сакаут в её пользу',
    hint: 'Туз-король против дам, туз на ривере',
    watch:
      'Почти проигранная рука: к тёрну у неё около 14%. Туз на ривере даёт удивление (выиграла с маленьким эквити), облегчение и радость. Реплика смущённая.',
    length: 12,
    moment: 8.3,
    hands: [{ hero: 'Ac Kd', villain: 'Qs Qh', board: ['8c 5d 2s', 'Jc', 'Ah'] }],
    beats: [
      { at: 0, do: 'deal', potBb: 3, investedBb: 1.5 },
      { at: 0, do: 'gaze', target: 'cards' },
      { at: 1.2, do: 'say', text: 'All in.' },
      { at: 1.2, do: 'pot', potBb: 51.5, investedBb: 50 },
      { at: 2.2, do: 'player', text: 'Snap call.' },
      { at: 2.2, do: 'pot', potBb: 100, investedBb: 50 },
      { at: 2.6, do: 'reveal' },
      { at: 2.6, do: 'gaze', target: 'board' },
      { at: 3.8, do: 'street', street: 'flop' },
      { at: 5.4, do: 'street', street: 'turn' },
      { at: 7.4, do: 'street', street: 'river' },
      { at: 7.8, do: 'result', netBb: 50 },
      { at: 8.8, do: 'gaze', target: 'player' },
      { at: 9, do: 'say', text: 'Sorry. I know, I know.' },
    ],
  },
  {
    id: 'flopstraight',
    title: 'Стрит на флопе',
    hint: 'Слабые семь-шесть, флоп приносит готовый стрит',
    watch:
      'Эквити прыгает с 46% до 85%. Банк пока маленький, но впереди две улицы и стек, поэтому надежда считается от того, что ещё можно выиграть. Скачок даёт удивление и радость, а не только удивление. Дальше она ведёт банк и выигрывает у двух пар.',
    length: 13,
    moment: 2.4,
    hands: [{ hero: '7s 6s', villain: 'Kc Tc', board: ['8d 9c Th', '2h', 'Kd'] }],
    beats: [
      { at: 0, do: 'deal', potBb: 6, investedBb: 3 },
      { at: 0, do: 'gaze', target: 'cards' },
      { at: 1.6, do: 'street', street: 'flop' },
      { at: 1.6, do: 'gaze', target: 'board' },
      { at: 3.2, do: 'gaze', target: 'player' },
      { at: 3.4, do: 'say', text: 'Five.' },
      { at: 3.4, do: 'pot', potBb: 11, investedBb: 8 },
      { at: 4.4, do: 'player', text: 'Call.' },
      { at: 4.4, do: 'pot', potBb: 16, investedBb: 8 },
      { at: 5.6, do: 'street', street: 'turn' },
      { at: 6.4, do: 'say', text: 'Twelve.' },
      { at: 6.4, do: 'pot', potBb: 28, investedBb: 20 },
      { at: 7.4, do: 'player', text: 'Call.' },
      { at: 7.4, do: 'pot', potBb: 40, investedBb: 20 },
      { at: 8.6, do: 'street', street: 'river' },
      { at: 9.4, do: 'say', text: 'Thirty.' },
      { at: 9.4, do: 'pot', potBb: 70, investedBb: 50 },
      { at: 10.4, do: 'player', text: 'Two pair. Call.' },
      { at: 10.4, do: 'pot', potBb: 100, investedBb: 50 },
      { at: 10.8, do: 'reveal' },
      { at: 11.2, do: 'result', netBb: 50 },
    ],
  },
  {
    id: 'raisetoppair',
    title: 'Рейз на топ-пару',
    hint: 'Король-дама на короле, её ставку рейзят, потом ставят снова',
    watch:
      'Против случайной руки топ-пара выглядит как 87%. Рейз соперника сужает его диапазон по блупринту V1, тем же расчётом, что в игре: сеты и две пары весят больше, но дро и блефы остаются, поэтому эквити падает только до 74%. Для свинга (порог 20%) этого мало: удивления и разочарования нет, растёт страх. Ставка на тёрне сужает его ещё раз, до 63%. Сам рейз воспринимается как вызов: у неуступчивых злость, у тревожных страх. Второй рейз за сессию злит сильнее первого.',
    length: 12.5,
    moment: 4.4,
    hands: [
      {
        hero: 'Kh Qd',
        villain: null,
        board: ['Kc 8d 4s', '8h', '2c'],
        line: [
          'him raise 3',
          'her call',
          'flop',
          'her raise 4',
          'him raise 14',
          'her call',
          'turn',
          'her check',
          'him raise 25',
        ],
      },
    ],
    beats: [
      { at: 0, do: 'deal', potBb: 6, investedBb: 3 },
      { at: 0, do: 'gaze', target: 'cards' },
      { at: 1.4, do: 'street', street: 'flop' },
      { at: 1.4, do: 'gaze', target: 'board' },
      { at: 2.4, do: 'gaze', target: 'player' },
      { at: 2.6, do: 'say', text: 'Four.' },
      { at: 2.6, do: 'pot', potBb: 10, investedBb: 7 },
      { at: 3.6, do: 'player', text: 'Raise to fourteen.' },
      { at: 3.6, do: 'oppBet', sizeBb: 14, potBb: 24, raise: true },
      { at: 3.6, do: 'narrow', after: 5 },
      { at: 4.6, do: 'gaze', target: 'think' },
      { at: 6.4, do: 'gaze', target: 'player' },
      { at: 6.6, do: 'say', text: 'Call.' },
      { at: 6.6, do: 'pot', potBb: 31, investedBb: 14 },
      { at: 7.8, do: 'street', street: 'turn' },
      { at: 8.6, do: 'player', text: 'Twenty five.' },
      { at: 8.6, do: 'oppBet', sizeBb: 25, potBb: 56 },
      { at: 8.6, do: 'narrow', after: 9 },
      { at: 9.4, do: 'gaze', target: 'think' },
      { at: 11, do: 'gaze', target: 'player' },
      { at: 11.2, do: 'say', text: 'Fold.' },
      { at: 11.4, do: 'result', netBb: -14, lastEquity: 0.5 },
    ],
  },
  {
    id: 'bluffwin',
    title: 'Блеф прошёл',
    hint: 'Семь-шесть одномастные, ставка в банк на ривере, соперник сбрасывает',
    watch:
      'Эквити против случайной руки падает до 10–20%, вложено уже 50 бб, поэтому страх высокий. Лицо играет уверенность (усилие покерфейса 0.6), но страх идёт мимо маски: частые моргания, взгляд в сторону. После фолда облегчение и гордость.',
    length: 13,
    moment: 8.5,
    hands: [{ hero: '7s 6s', villain: null, board: ['Ad Kc 3h', '4d', 'Qc'] }],
    beats: [
      { at: 0, do: 'deal', potBb: 6, investedBb: 3 },
      { at: 0, do: 'gaze', target: 'cards' },
      { at: 1.6, do: 'street', street: 'flop' },
      { at: 2.2, do: 'pot', potBb: 16, investedBb: 8 },
      { at: 3.2, do: 'street', street: 'turn' },
      { at: 3.8, do: 'pot', potBb: 40, investedBb: 20 },
      { at: 4.8, do: 'street', street: 'river' },
      { at: 5.4, do: 'effort', effort: 0.6, acted: CONFIDENT },
      { at: 5.6, do: 'gaze', target: 'player' },
      { at: 5.8, do: 'say', text: 'Pot.' },
      { at: 5.8, do: 'pot', potBb: 70, investedBb: 50 },
      { at: 7, do: 'player', text: 'Hmm. Let me think about this one.' },
      { at: 10, do: 'player', text: 'Fine. Fold.' },
      { at: 10.4, do: 'bluff', succeeded: true },
      { at: 10.4, do: 'result', netBb: 20 },
      { at: 11.2, do: 'effort', effort: 0, acted: null },
      { at: 11.4, do: 'say', text: 'Thanks.' },
    ],
  },
  {
    id: 'bluffcaught',
    title: 'Блеф поймали',
    hint: 'Тот же блеф, соперник коллирует и подкалывает',
    watch:
      'Та же раздача, но соперник коллирует с A♥J♥. Стыд за пойманный блеф и огорчение от проигрыша 50 бб, потом подколка добавляет злость. Тильт смешанный: стыд и месть.',
    length: 16,
    moment: 11.6,
    hands: [{ hero: '7s 6s', villain: 'Ah Jh', board: ['Ad Kc 3h', '4d', 'Qc'] }],
    beats: [
      { at: 0, do: 'deal', potBb: 6, investedBb: 3 },
      { at: 0, do: 'gaze', target: 'cards' },
      { at: 1.6, do: 'street', street: 'flop' },
      { at: 2.2, do: 'pot', potBb: 16, investedBb: 8 },
      { at: 3.2, do: 'street', street: 'turn' },
      { at: 3.8, do: 'pot', potBb: 40, investedBb: 20 },
      { at: 4.8, do: 'street', street: 'river' },
      { at: 5.4, do: 'effort', effort: 0.6, acted: CONFIDENT },
      { at: 5.6, do: 'gaze', target: 'player' },
      { at: 5.8, do: 'say', text: 'Pot.' },
      { at: 5.8, do: 'pot', potBb: 70, investedBb: 50 },
      { at: 7.4, do: 'player', text: 'I call.' },
      { at: 7.4, do: 'pot', potBb: 100, investedBb: 50 },
      { at: 8, do: 'reveal' },
      { at: 8, do: 'effort', effort: 0, acted: null },
      { at: 8.2, do: 'bluff', succeeded: false },
      { at: 8.2, do: 'result', netBb: -50 },
      { at: 8.4, do: 'gaze', target: 'down' },
      { at: 10.4, do: 'player', text: 'Nice bluff. Do it again.', signal: 'mockBluff' },
      { at: 11.2, do: 'gaze', target: 'player' },
      { at: 12.4, do: 'say', text: 'Enjoy it while it lasts.' },
    ],
  },
  {
    id: 'mistake',
    title: 'Сбросила лучшую руку',
    hint: 'Дамы, крупная ставка на ривере, фолд, а у соперника был блеф',
    watch:
      'Ставка соперника 40 бб поднимает страх, она думает и сбрасывает. Соперник показывает 7♣6♣ без пары. Ошибка стоила 80 бб, это стыд. Перегрузка в основном от стыда, а стыд делает игру зажатой: агрессия и блеф ниже единицы.',
    length: 13,
    moment: 10.9,
    hands: [{ hero: 'Qh Qd', villain: '7c 6c', board: ['Ks 8c 4d', '2h', '9s'] }],
    beats: [
      { at: 0, do: 'deal', potBb: 6, investedBb: 3 },
      { at: 0, do: 'gaze', target: 'cards' },
      { at: 1.6, do: 'street', street: 'flop' },
      { at: 2.4, do: 'pot', potBb: 18, investedBb: 9 },
      { at: 3.2, do: 'street', street: 'turn' },
      { at: 3.8, do: 'pot', potBb: 40, investedBb: 20 },
      { at: 4.8, do: 'street', street: 'river' },
      { at: 5.6, do: 'player', text: 'Forty.' },
      { at: 5.6, do: 'oppBet', sizeBb: 40, potBb: 80 },
      { at: 6, do: 'gaze', target: 'think' },
      { at: 8.6, do: 'gaze', target: 'player' },
      { at: 8.8, do: 'say', text: 'Fold.' },
      { at: 9.2, do: 'result', netBb: -20, lastEquity: 0.5 },
      { at: 9.8, do: 'player', text: 'Had nothing, by the way.' },
      { at: 9.8, do: 'reveal' },
      { at: 10.2, do: 'mistake', costBb: 80 },
      { at: 10.2, do: 'gaze', target: 'down' },
    ],
  },
  {
    id: 'tell',
    title: 'Тик сквозь покерфейс',
    hint: 'Пара тузов на префлопе, изо всех сил держит лицо',
    watch:
      'Сильная стартовая рука даёт радость. Покерфейс почти полный (усилие 0.85), поэтому радость прорывается микровыражением на четверть секунды, затем сжатые губы и моргания. Включите замедление.',
    length: 8,
    moment: 1.2,
    hands: [{ hero: 'Ad Ac', villain: null, board: ['Ts 7h 3c', '2d', 'Kh'] }],
    beats: [
      { at: 0, do: 'effort', effort: 0.85, acted: null },
      { at: 0, do: 'gaze', target: 'cards' },
      { at: 1.1, do: 'deal', potBb: 3, investedBb: 1.5 },
      { at: 2, do: 'gaze', target: 'chips' },
      { at: 3.6, do: 'gaze', target: 'player' },
      { at: 4.2, do: 'say', text: 'Raise.' },
      { at: 4.2, do: 'pot', potBb: 8, investedBb: 6 },
    ],
  },
  {
    id: 'revenge',
    title: 'Подколки и месть',
    hint: 'Проигрыш, насмешка, давление и снова насмешка от того же игрока',
    watch:
      'Злость копится от каждой реплики соперника и от проигрыша ему. Когда нагрузка превышает самообладание, наступает перегрузка от злости, и злость доходит до игры: агрессия и блеф идут вверх. Смотрите на панель стиля игры.',
    length: 15,
    moment: 11.7,
    hands: [
      { hero: 'Kd Jd', villain: 'Ac 7c', board: ['Js 6h 2c', 'Ah', '4s'] },
      { hero: 'Ts 8s', villain: null, board: ['Qd 9c 3h', '2s', '5d'] },
      { hero: '5h 4h', villain: null, board: ['Ks Qc 7d', '3s', 'Jh'] },
    ],
    beats: [
      { at: 0, do: 'deal', hand: 0, potBb: 6, investedBb: 3 },
      { at: 0, do: 'gaze', target: 'cards' },
      { at: 1, do: 'street', street: 'flop' },
      { at: 1.6, do: 'pot', potBb: 26, investedBb: 13 },
      { at: 2.4, do: 'street', street: 'turn' },
      { at: 3.2, do: 'street', street: 'river' },
      { at: 3.2, do: 'reveal' },
      { at: 3.6, do: 'result', netBb: -13 },
      { at: 4.4, do: 'player', text: 'Too easy.', signal: 'tease' },
      { at: 4.6, do: 'gaze', target: 'player' },
      { at: 6.5, do: 'deal', hand: 1, potBb: 3, investedBb: 1.5 },
      { at: 7.5, do: 'player', text: 'Ten big blinds. Scared?', signal: 'mockBluff' },
      { at: 7.5, do: 'oppBet', sizeBb: 10, potBb: 13 },
      { at: 8.6, do: 'say', text: 'Fold.' },
      { at: 8.8, do: 'result', netBb: -1.5, lastEquity: 0.5 },
      { at: 9.4, do: 'player', text: 'Thought so.', signal: 'tease' },
      { at: 11, do: 'deal', hand: 2, potBb: 3, investedBb: 1.5 },
      { at: 11.8, do: 'gaze', target: 'player' },
      { at: 12, do: 'say', text: 'Raise. Twenty.' },
      { at: 12, do: 'pot', potBb: 23, investedBb: 21.5 },
    ],
  },
  {
    id: 'streak',
    title: 'Серия проигрышей',
    hint: 'Пять проигранных банков подряд за сессию',
    watch:
      'Каждый проигрыш добавляет огорчение, настроение сползает к апатии и тревожности, минус по сессии растёт до 205 бб. Перегрузка в основном от минуса по сессии: игра становится шире и липче, она коллирует до конца, чтобы отыграться (Smith, Levere и Kurtzman, 2009).',
    length: 15,
    moment: 12.5,
    hands: [
      { hero: 'Ah Qd', villain: null, board: ['Kc 8d 2s', '7h', '4c'] },
      { hero: 'Jc Jd', villain: null, board: ['Ah Kd 6s', '9c', '2h'] },
      { hero: 'Ts 9s', villain: null, board: ['8s 7d 2s', 'Kh', '3c'] },
      { hero: 'Kc Qc', villain: null, board: ['Kd 6h 5h', '4h', '9h'] },
      { hero: '8h 8c', villain: null, board: ['Qs Jd 3c', '5s', 'As'] },
    ],
    beats: [
      { at: 0, do: 'deal', hand: 0, potBb: 6, investedBb: 3 },
      { at: 1.4, do: 'result', netBb: -40, lastEquity: 0.45 },
      { at: 2.6, do: 'deal', hand: 1, potBb: 6, investedBb: 3 },
      { at: 4, do: 'result', netBb: -25, lastEquity: 0.35 },
      { at: 5.2, do: 'deal', hand: 2, potBb: 6, investedBb: 3 },
      { at: 6.6, do: 'result', netBb: -60, lastEquity: 0.4 },
      { at: 7.8, do: 'deal', hand: 3, potBb: 6, investedBb: 3 },
      { at: 9.2, do: 'result', netBb: -30, lastEquity: 0.3 },
      { at: 10.4, do: 'deal', hand: 4, potBb: 6, investedBb: 3 },
      { at: 11.8, do: 'result', netBb: -50, lastEquity: 0.45 },
      { at: 12.6, do: 'gaze', target: 'player' },
      { at: 12.8, do: 'say', text: 'This is not my night.' },
    ],
  },
];
