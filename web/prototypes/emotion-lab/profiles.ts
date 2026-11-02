import { PERSONALITIES } from '../../src/emotion/index.ts';
import type { Personality } from '../../src/emotion/index.ts';
import { leakOf } from '../../src/face/index.ts';
import type { FaceLook } from '../../src/face/index.ts';

export type { FaceLook };

export interface Profile {
  id: string;
  name: string;
  hint: string;
  description: string;
  personality: Personality;
  face: FaceLook;
}

export const PROFILES = {
  mira: {
    id: 'mira',
    name: 'Мира',
    hint: 'Уравновешенная, открытое лицо',
    description:
      'Дружелюбная и в меру открытая, эмоционально устойчивая. Играет средне, эмоций почти не прячет, злится по делу и быстро отходит.',
    personality: PERSONALITIES.mira,
    face: {
      brows: 1,
      eyes: 1,
      mouth: 1,
      smileSide: 0.4,
      blink: 1,
      lettersPerSecond: 13,
      leak: leakOf(-0.1),
    },
  },
  ingrid: {
    id: 'ingrid',
    name: 'Ингрид',
    hint: 'Каменное лицо, выдают брови',
    description:
      'Профессионалка: замкнутая, собранная, очень устойчивая и не слишком любезная. Почти не меняется в лице и почти не тильтует, а если тильтует, это не доходит до игры. Выдают её только брови.',
    personality: PERSONALITIES.ingrid,
    face: {
      brows: 1.7,
      eyes: 0.7,
      mouth: 0.45,
      smileSide: 0.15,
      blink: 0.6,
      lettersPerSecond: 11,
      leak: leakOf(-0.6),
    },
  },
  lola: {
    id: 'lola',
    name: 'Лола',
    hint: 'Душа компании, всё на лице',
    description:
      'Экстравертка с высокой эмоциональностью, пришла повеселиться. Неопытная и неорганизованная: эмоции ярко видны и быстро доходят до игры, бэд-бит превращается в громкий тильт.',
    personality: PERSONALITIES.lola,
    face: {
      brows: 1.1,
      eyes: 1.1,
      mouth: 1.35,
      smileSide: 0.3,
      blink: 1.2,
      lettersPerSecond: 15,
      leak: leakOf(0.5),
    },
  },
  nina: {
    id: 'nina',
    name: 'Нина',
    hint: 'Нервный новичок, прячет и выдаёт',
    description:
      'Новичок с высокой тревожностью. Старается держать лицо, но страх и стыд сильные и держатся долго, а дисциплины не хватает: тревога сразу видна в игре.',
    personality: PERSONALITIES.nina,
    face: {
      brows: 1.25,
      eyes: 1.25,
      mouth: 0.8,
      smileSide: 0,
      blink: 1.4,
      lettersPerSecond: 14,
      leak: leakOf(0.8),
    },
  },
} satisfies Record<string, Profile>;

export type ProfileId = keyof typeof PROFILES;
