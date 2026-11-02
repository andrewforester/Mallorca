import type { Deps } from "./handler.ts";

export type Input = Parameters<Deps["complete"]>[0];

export const DELIVERY = { emotion: "joy", intensity: 0.4 };

export interface Fake {
  deps: Deps;
  inputs: Input[];
  saved: { speaker: string; text: string }[][];
  facts: string[][];
  consumed: number;
  tasks: Promise<void>[];
}

interface Options {
  user?: string | null;
  allow?: number;
  texts?: (string | Error)[];
  signals?: unknown;
  facts?: unknown;
  throwFrom?: number;
}

export function fake(options: Options = {}): Fake {
  const state: Fake = {
    deps: null as unknown as Deps,
    inputs: [],
    saved: [],
    facts: [],
    consumed: 0,
    tasks: [],
  };
  const texts = [...(options.texts ?? ["Nice try, friend."])];
  const allow = options.allow ?? Infinity;
  state.deps = {
    userId: () => Promise.resolve(options.user === undefined ? "u1" : options.user),
    consume: () => {
      const n = state.consumed++;
      if (options.throwFrom !== undefined && n >= options.throwFrom) {
        return Promise.reject(new Error("rpc"));
      }
      return Promise.resolve(n < allow);
    },
    memories: () => Promise.resolve(["Likes to bluff."]),
    saveLines: (_user, _session, lines) => {
      state.saved.push(lines);
      return Promise.resolve();
    },
    saveFacts: (_user, facts) => {
      state.facts.push(facts);
      return Promise.resolve();
    },
    background: (task) => void state.tasks.push(task),
    complete: (input) => {
      state.inputs.push(input);
      if (input.purpose === "signals") {
        if (options.signals instanceof Error) return Promise.reject(options.signals);
        return Promise.resolve({ text: "", data: options.signals ?? { signals: [] } });
      }
      if (input.purpose === "summary") {
        return Promise.resolve({ text: "", data: options.facts ?? { facts: [] } });
      }
      const next = texts.length > 1 ? texts.shift()! : texts[0];
      if (next instanceof Error) return Promise.reject(next);
      const data = { text: next, delivery: DELIVERY };
      return Promise.resolve({ text: JSON.stringify(data), data });
    },
  };
  return state;
}

export const post = (body: unknown, raw?: string): Request =>
  new Request("https://f.example/talk", {
    method: "POST",
    headers: { authorization: "Bearer t" },
    body: raw ?? JSON.stringify(body),
  });
