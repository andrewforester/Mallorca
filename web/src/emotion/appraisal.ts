import { clamp01, saturate, smoothstep } from './emotions.ts';
import type { Emotion, Emotions } from './emotions.ts';
import type { Traits } from './personality.ts';

export const STAKE_BB = 20;

export type ChatSignal =
  'tease' | 'compliment' | 'claimStrength' | 'claimWeakness' | 'mockBluff' | 'friendly';

export interface Money {
  potBb: number;
  investedBb: number;
  stackBb?: number;
  streetsLeft?: number;
}

export interface Prospect extends Money {
  equity: number;
  previousEquity?: number;
}

export type TableEvent =
  | ({ kind: 'deal'; equity: number } & Money)
  | ({ kind: 'street'; equity: number; previousEquity?: number } & Money)
  | { kind: 'opponentBet'; sizeBb: number; equity: number; raise?: boolean; pressure?: number }
  | { kind: 'result'; netBb: number; lastEquity?: number }
  | { kind: 'bluff'; succeeded: boolean; potBb: number }
  | { kind: 'mistake'; costBb: number }
  | { kind: 'chat'; signal: ChatSignal };

export interface Impulse {
  emotion: Emotion;
  amount: number;
  reason: string;
}

export const FUTURE_RISK = 0.5;

export function stakesOf(m: Money): { toWin: number; toLose: number } {
  const future = Math.min(m.stackBb ?? 0, m.potBb * (m.streetsLeft ?? 0));
  return {
    toWin: Math.max(0, m.potBb - m.investedBb) + future,
    toLose: m.investedBb + FUTURE_RISK * future,
  };
}

export function prospectTargets(p: Prospect, traits: Traits): { hope: number; fear: number } {
  const { toWin, toLose } = stakesOf(p);
  return {
    hope: clamp01(saturate((p.equity * toWin) / STAKE_BB) * traits.gains.hope),
    fear: clamp01(saturate(((1 - p.equity) * toLose) / STAKE_BB) * traits.gains.fear),
  };
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

export const SWING = 0.2;

function streetImpulses(
  event: Extract<TableEvent, { kind: 'street' }>,
  emotions: Emotions,
): Impulse[] {
  const { equity, previousEquity: previous } = event;
  if (previous === undefined) {
    return [];
  }
  const delta = equity - previous;
  const swing = Math.abs(delta);
  if (swing < SWING) {
    return [];
  }
  const label = `equity ${pct(previous)} to ${pct(equity)}`;
  const list: Impulse[] = [
    {
      emotion: 'surprise',
      amount: saturate((swing - 0.15) * 3),
      reason: `${label}, a swing of ${pct(swing)}`,
    },
  ];
  if (delta < 0) {
    list.push({
      emotion: 'disappointment',
      amount: emotions.hope * swing,
      reason: `${label}: hope breaks`,
    });
  } else {
    const { toWin } = stakesOf(event);
    list.push(
      { emotion: 'relief', amount: emotions.fear * swing, reason: `${label}: fear eases` },
      {
        emotion: 'joy',
        amount: swing * (0.3 + 0.7 * saturate(toWin / STAKE_BB)),
        reason: `${label}: the hand grew, up to ${Math.round(toWin)} bb ahead`,
      },
    );
  }
  return list;
}

function raiseImpulses(event: Extract<TableEvent, { kind: 'opponentBet' }>): Impulse[] {
  const fear = 0.6 * saturate(event.sizeBb / STAKE_BB) * (1 - event.equity);
  const label = `the opponent ${event.raise ? 'raises' : 'bets'} ${event.sizeBb} bb, her equity ${pct(event.equity)}`;
  if (!event.raise) {
    return [{ emotion: 'fear', amount: fear, reason: label }];
  }
  const pressure = Math.min(3, event.pressure ?? 0);
  return [
    { emotion: 'fear', amount: fear + 0.08, reason: `${label}: pressure on her` },
    {
      emotion: 'anger',
      amount: 0.12 * (1 + 0.5 * pressure),
      reason: `${label}: a challenge${pressure > 0 ? `, ${Math.round(pressure * 10) / 10} raises this session` : ''}`,
    },
  ];
}

function premiumImpulses(equity: number): Impulse[] {
  const amount = 0.6 * smoothstep(0.6, 0.85, equity);
  return amount > 0
    ? [{ emotion: 'joy', amount, reason: `a strong starting hand, equity ${pct(equity)}` }]
    : [];
}

function winImpulses(netBb: number, lastEquity: number, emotions: Emotions): Impulse[] {
  const list: Impulse[] = [
    { emotion: 'joy', amount: saturate(netBb / STAKE_BB), reason: `won ${netBb} bb` },
    { emotion: 'relief', amount: emotions.fear, reason: 'the fear did not come true' },
  ];
  const unlikely = smoothstep(0.5, 0.9, 1 - lastEquity);
  if (unlikely > 0) {
    list.push({
      emotion: 'surprise',
      amount: unlikely,
      reason: `won with equity ${pct(lastEquity)}`,
    });
  }
  return list;
}

function lossImpulses(netBb: number, lastEquity: number, emotions: Emotions): Impulse[] {
  const loss = saturate(-netBb / STAKE_BB);
  const list: Impulse[] = [
    { emotion: 'distress', amount: loss, reason: `lost ${-netBb} bb` },
    { emotion: 'disappointment', amount: emotions.hope, reason: 'the hope did not come true' },
  ];
  const unjust = smoothstep(0.5, 0.95, lastEquity);
  if (unjust > 0) {
    list.push({
      emotion: 'injustice',
      amount: loss * unjust,
      reason: `lost while ahead with ${pct(lastEquity)}`,
    });
    list.push({
      emotion: 'surprise',
      amount: smoothstep(0.6, 0.95, lastEquity),
      reason: 'a card against the odds',
    });
  }
  return list;
}

const CHAT: Readonly<Record<ChatSignal, ReadonlyArray<[Emotion, number]>>> = {
  tease: [['anger', 0.25]],
  mockBluff: [
    ['anger', 0.35],
    ['shame', 0.08],
  ],
  compliment: [
    ['pride', 0.15],
    ['joy', 0.1],
  ],
  friendly: [['joy', 0.1]],
  claimStrength: [['fear', 0.12]],
  claimWeakness: [['hope', 0.1]],
};

function rawImpulses(event: TableEvent, emotions: Emotions): Impulse[] {
  switch (event.kind) {
    case 'deal':
      return premiumImpulses(event.equity);
    case 'street':
      return streetImpulses(event, emotions);
    case 'opponentBet':
      return raiseImpulses(event);
    case 'result': {
      const last = event.lastEquity ?? 0.5;
      return event.netBb >= 0
        ? winImpulses(event.netBb, last, emotions)
        : lossImpulses(event.netBb, last, emotions);
    }
    case 'bluff':
      return event.succeeded
        ? [
            {
              emotion: 'pride',
              amount: 0.8 * saturate(event.potBb / STAKE_BB),
              reason: 'the bluff got through',
            },
          ]
        : [
            {
              emotion: 'shame',
              amount: saturate(event.potBb / STAKE_BB),
              reason: 'the bluff was caught',
            },
          ];
    case 'mistake':
      return [
        {
          emotion: 'shame',
          amount: saturate(event.costBb / STAKE_BB),
          reason: `the mistake cost ${event.costBb} bb`,
        },
      ];
    case 'chat':
      return CHAT[event.signal].map(([emotion, amount]) => ({
        emotion,
        amount,
        reason: `chat: ${event.signal}`,
      }));
  }
}

export function appraise(event: TableEvent, emotions: Emotions, traits: Traits): Impulse[] {
  return rawImpulses(event, emotions)
    .map((i) => ({ ...i, amount: clamp01(i.amount * traits.gains[i.emotion]) }))
    .filter((i) => i.amount > 0.005);
}
