import type { Personality } from '../../src/emotion/index.ts';

export interface FaceLook {
  brows: number;
  eyes: number;
  mouth: number;
  smileSide: number;
  blink: number;
  lettersPerSecond: number;
}

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
    personality: {
      bigFive: {
        openness: 0.3,
        conscientiousness: 0.2,
        extraversion: 0.2,
        agreeableness: 0.4,
        neuroticism: -0.1,
      },
      suppression: 0.3,
      experience: 0.5,
    },
    face: { brows: 1, eyes: 1, mouth: 1, smileSide: 0.4, blink: 1, lettersPerSecond: 13 },
  },
  ingrid: {
    id: 'ingrid',
    name: 'Ингрид',
    hint: 'Каменное лицо, выдают брови',
    description:
      'Профессионалка: замкнутая, собранная, очень устойчивая и не слишком любезная. Почти не меняется в лице и почти не тильтует, а если тильтует, это не доходит до игры. Выдают её только брови.',
    personality: {
      bigFive: {
        openness: -0.1,
        conscientiousness: 0.7,
        extraversion: -0.5,
        agreeableness: -0.3,
        neuroticism: -0.6,
      },
      suppression: 0.85,
      experience: 0.9,
    },
    face: { brows: 1.7, eyes: 0.7, mouth: 0.45, smileSide: 0.15, blink: 0.6, lettersPerSecond: 11 },
  },
  lola: {
    id: 'lola',
    name: 'Лола',
    hint: 'Душа компании, всё на лице',
    description:
      'Экстравертка с высокой эмоциональностью, пришла повеселиться. Неопытная и неорганизованная: эмоции ярко видны и быстро доходят до игры, бэд-бит превращается в громкий тильт.',
    personality: {
      bigFive: {
        openness: 0.6,
        conscientiousness: -0.4,
        extraversion: 0.9,
        agreeableness: 0.5,
        neuroticism: 0.5,
      },
      suppression: 0.08,
      experience: 0.2,
    },
    face: { brows: 1.1, eyes: 1.1, mouth: 1.35, smileSide: 0.3, blink: 1.2, lettersPerSecond: 15 },
  },
  nina: {
    id: 'nina',
    name: 'Нина',
    hint: 'Нервный новичок, прячет и выдаёт',
    description:
      'Новичок с высокой тревожностью. Старается держать лицо, но страх и стыд сильные и держатся долго, а дисциплины не хватает: тревога сразу видна в игре.',
    personality: {
      bigFive: {
        openness: 0.1,
        conscientiousness: 0.3,
        extraversion: -0.3,
        agreeableness: 0.4,
        neuroticism: 0.8,
      },
      suppression: 0.55,
      experience: 0,
    },
    face: { brows: 1.25, eyes: 1.25, mouth: 0.8, smileSide: 0, blink: 1.4, lettersPerSecond: 14 },
  },
} satisfies Record<string, Profile>;

export type ProfileId = keyof typeof PROFILES;
