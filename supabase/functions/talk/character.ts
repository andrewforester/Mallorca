import type { BigFive } from "./planTypes.ts";

export type Qualifier = "a bit" | "very" | "extremely";

const ORDER: readonly (keyof BigFive)[] = [
  "extraversion",
  "agreeableness",
  "neuroticism",
  "openness",
  "conscientiousness",
];

const POLES: Readonly<Record<keyof BigFive, { plus: string; minus: string }>> = {
  extraversion: {
    plus: "outgoing: you speak up readily and warmly, though briefly",
    minus: "reserved: you say little and let the player talk first",
  },
  agreeableness: {
    plus: "warm: you are kind and glad when the player plays well",
    minus: "cool: you are blunt, and praise does not come easily",
  },
  neuroticism: {
    plus: "sensitive: under pressure your words hedge and turn to yourself",
    minus: "steady: even a bad beat gets a level word",
  },
  openness: {
    plus: "imaginative: you pick a vivid word over a stock phrase",
    minus: "plain: you say things simply and literally",
  },
  conscientiousness: {
    plus: "composed: you put things carefully and precisely",
    minus: "loose: you speak on impulse and leave things half said",
  },
};

export function qualifierOf(x: number): Qualifier | null {
  const size = Math.abs(x);
  if (size < 0.2) return null;
  if (size < 0.45) return "a bit";
  return size < 0.75 ? "very" : "extremely";
}

export function characterText(bigFive: BigFive): string {
  return ORDER.flatMap((trait) => {
    const value = bigFive[trait];
    const qualifier = qualifierOf(value);
    if (qualifier === null) return [];
    const pole = value > 0 ? POLES[trait].plus : POLES[trait].minus;
    return [`You are ${qualifier} ${pole}.`];
  }).join(" ");
}
