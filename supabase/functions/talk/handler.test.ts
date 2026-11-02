import { assert, assertEquals } from "../_shared/testing.ts";
import { FALLBACK_LINES } from "./filter.ts";
import { handle, handleSafely, inBackground, parseSpoken } from "./handler.ts";
import { FACTS_SCHEMA, LINE_SCHEMA } from "./prompt.ts";
import { SIGNAL_SCHEMA } from "./signals.ts";
import type { Deps } from "./handler.ts";
import { fixture } from "./fixtures/fixtures.ts";

type Input = Parameters<Deps["complete"]>[0];

const DELIVERY = { emotion: "joy", intensity: 0.4 };

interface Fake {
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

function fake(options: Options = {}): Fake {
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

const post = (body: unknown, raw?: string): Request =>
  new Request("https://f.example/talk", {
    method: "POST",
    headers: { authorization: "Bearer t" },
    body: raw ?? JSON.stringify(body),
  });

const json = async (res: Response): Promise<Record<string, unknown>> => await res.json();

Deno.test("no user answers 401 and calls nothing", async () => {
  const f = fake({ user: null });
  const res = await handle(post(fixture("line")), f.deps);
  assertEquals(res.status, 401);
  assertEquals(f.inputs.length, 0);
  assertEquals(f.consumed, 0);
});

Deno.test("a bad body answers 400", async () => {
  const f = fake();
  assertEquals((await handle(post(null, "not json"), f.deps)).status, 400);
  assertEquals((await handle(post({ kind: "line" }), f.deps)).status, 400);
  assertEquals(f.inputs.length, 0);
});

Deno.test("a body over 16 KB answers 413 before parsing", async () => {
  const f = fake();
  const res = await handle(post(null, "x".repeat(16 * 1024 + 1)), f.deps);
  assertEquals(res.status, 413);
  assertEquals(f.consumed, 0);
});

Deno.test("only POST is accepted", async () => {
  const f = fake();
  const res = await handle(new Request("https://f.example/talk", { method: "GET" }), f.deps);
  assertEquals(res.status, 405);
});

Deno.test("over the limit answers 429 silent without a model call", async () => {
  const f = fake({ allow: 0 });
  const res = await handle(post(fixture("line")), f.deps);
  assertEquals(res.status, 429);
  assertEquals(await json(res), { silent: true });
  assertEquals(f.inputs.length, 0);
});

Deno.test("a line answers its text and saves it", async () => {
  const f = fake({ texts: ["  Your move.  "] });
  const res = await handle(post(fixture("line")), f.deps);
  assertEquals(res.status, 200);
  assertEquals(await json(res), { text: "Your move.", delivery: DELIVERY });
  assertEquals(f.inputs.length, 1);
  assertEquals(f.inputs[0].schema, LINE_SCHEMA);
  assertEquals(f.saved, [[{ speaker: "mallorca", text: "Your move." }]]);
  assertEquals(f.consumed, 1);
});

Deno.test("a reply returns signals from their schema and saves both speakers", async () => {
  const f = fake({ signals: { signals: ["tease", "bogus"] } });
  const body = fixture("reply");
  const res = await handle(post(body), f.deps);
  assertEquals(res.status, 200);
  assertEquals(await json(res), {
    text: "Nice try, friend.",
    delivery: DELIVERY,
    signals: ["tease"],
  });
  assertEquals(f.inputs.length, 2);
  assertEquals(f.inputs.filter((i) => i.schema === SIGNAL_SCHEMA).length, 1);
  assertEquals(f.consumed, 2);
  assertEquals(f.saved, [[
    { speaker: "player", text: (body.text as string).trim() },
    { speaker: "mallorca", text: "Nice try, friend." },
  ]]);
});

Deno.test("a failed signals call still answers the text with no signals", async () => {
  const f = fake({ signals: new Error("boom") });
  const res = await handle(post(fixture("reply")), f.deps);
  assertEquals(res.status, 200);
  assertEquals(await json(res), { text: "Nice try, friend.", delivery: DELIVERY, signals: [] });
});

Deno.test("a failed text call answers 502", async () => {
  const f = fake({ texts: [new Error("down")] });
  assertEquals((await handle(post(fixture("line")), f.deps)).status, 502);
  assertEquals(
    (await handle(post(fixture("reply")), fake({ texts: [new Error("x")] }).deps)).status,
    502,
  );
  assertEquals(f.saved.length, 0);
});

Deno.test("a failed text call is logged with its error", async () => {
  const f = fake({ texts: [new Error("model down")] });
  const original = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    assertEquals((await handle(post(fixture("line")), f.deps)).status, 502);
  } finally {
    console.error = original;
  }
  assertEquals(logged.length, 1);
  assertEquals((logged[0][1] as Error).message, "model down");
});

Deno.test("an empty model text answers 502", async () => {
  const f = fake({ texts: ["   "] });
  assertEquals((await handle(post(fixture("line")), f.deps)).status, 502);
});

const her = (fixture("line").facts as { her: string[] }).her;
const leak = `I hold the ${her[0]} and ${her[1]} for sure.`;

Deno.test("a leak then a clean text returns the clean text after two calls", async () => {
  assert(her !== null);
  const f = fake({ texts: [leak, "Clean line."] });
  const res = await handle(post(fixture("line")), f.deps);
  assertEquals(await json(res), { text: "Clean line.", delivery: DELIVERY });
  assertEquals(f.inputs.length, 2);
  assert(f.inputs[1].system[1].text !== f.inputs[0].system[1].text);
  assertEquals(f.consumed, 2);
  assertEquals(f.saved, [[{ speaker: "mallorca", text: "Clean line." }]]);
});

Deno.test("two leaks answer a fallback line", async () => {
  const f = fake({ texts: [leak, leak] });
  const res = await handle(post(fixture("line")), f.deps);
  const { text } = await json(res);
  assert(FALLBACK_LINES.includes(text as string));
  assertEquals(f.inputs.length, 2);
});

Deno.test("a retry refused by consume answers a fallback line", async () => {
  const f = fake({ texts: [leak, "Clean line."], allow: 1 });
  const res = await handle(post(fixture("line")), f.deps);
  assertEquals(res.status, 200);
  const { text } = await json(res);
  assert(FALLBACK_LINES.includes(text as string));
  assertEquals(f.inputs.length, 1);
});

Deno.test("a reply costs two calls and a leak retry one more", async () => {
  const f = fake({ texts: [leak, "Clean line."] });
  await handle(post(fixture("reply")), f.deps);
  assertEquals(f.consumed, 3);
});

Deno.test("a summary asks for facts by their schema, caps at three and saves", async () => {
  const f = fake({ facts: { facts: ["a", "b", "c", "d"] } });
  const res = await handle(post(fixture("summary")), f.deps);
  assertEquals(res.status, 200);
  assertEquals(await json(res), { facts: ["a", "b", "c"] });
  assertEquals(f.inputs[0].schema, FACTS_SCHEMA);
  assertEquals(f.facts, [["a", "b", "c"]]);
  assertEquals(f.consumed, 1);
});

Deno.test("a summary with no facts saves nothing", async () => {
  const f = fake();
  const res = await handle(post(fixture("summary")), f.deps);
  assertEquals(await json(res), { facts: [] });
  assertEquals(f.facts.length, 0);
});

Deno.test("a summary over the limit answers 429 silent", async () => {
  const f = fake({ allow: 0 });
  const res = await handle(post(fixture("summary")), f.deps);
  assertEquals(res.status, 429);
});

Deno.test("a throwing consume before the first model call answers 429 silent", async () => {
  const f = fake({ throwFrom: 0 });
  const res = await handle(post(fixture("line")), f.deps);
  assertEquals(res.status, 429);
  assertEquals(await json(res), { silent: true });
  assertEquals(f.inputs.length, 0);
});

Deno.test("a throwing consume on a retry answers a fallback line", async () => {
  const f = fake({ texts: [leak, "Clean line."], throwFrom: 1 });
  const res = await handle(post(fixture("line")), f.deps);
  assertEquals(res.status, 200);
  const { text } = await json(res);
  assert(FALLBACK_LINES.includes(text as string));
  assertEquals(f.inputs.length, 1);
});

Deno.test("an exception that escapes handle becomes a 502", async () => {
  const f = fake();
  f.deps.userId = () => Promise.reject(new Error("auth down"));
  const res = await handleSafely(post(fixture("line")), f.deps);
  assertEquals(res.status, 502);
});

Deno.test("a failing save is logged and does not fail the answer", async () => {
  const f = fake();
  f.deps.saveLines = () => Promise.reject(new Error("db"));
  const original = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    const res = await handle(post(fixture("line")), f.deps);
    assertEquals(res.status, 200);
    await Promise.all(f.tasks);
  } finally {
    console.error = original;
  }
  assertEquals(logged.length, 1);
});

Deno.test("a quick reply makes one model call and spends one call", async () => {
  const f = fake({ signals: { signals: ["tease"] } });
  const res = await handle(post({ ...fixture("reply"), quick: true }), f.deps);
  assertEquals(res.status, 200);
  assertEquals(await json(res), { text: "Nice try, friend.", delivery: DELIVERY, signals: [] });
  assertEquals(f.inputs.length, 1);
  assertEquals(f.inputs[0].schema, LINE_SCHEMA);
  assertEquals(f.consumed, 1);
});

Deno.test("the answer does not wait for the saves", async () => {
  const f = fake({ facts: { facts: ["a"] } });
  f.deps.saveLines = () => new Promise(() => undefined);
  f.deps.saveFacts = () => new Promise(() => undefined);
  assertEquals((await handle(post(fixture("line")), f.deps)).status, 200);
  assertEquals((await handle(post(fixture("reply")), f.deps)).status, 200);
  assertEquals((await handle(post(fixture("summary")), f.deps)).status, 200);
  assertEquals(f.tasks.length, 3);
});

Deno.test("memories load while the first call is being counted", async () => {
  const f = fake();
  let loaded = false;
  let release: (ok: boolean) => void = () => undefined;
  f.deps.memories = () => {
    loaded = true;
    return Promise.resolve([]);
  };
  f.deps.consume = () => new Promise((resolve) => (release = resolve));
  const pending = handle(post(fixture("line")), f.deps);
  for (let i = 0; i < 10 && !loaded; i += 1) await Promise.resolve();
  assert(loaded);
  release(true);
  assertEquals((await pending).status, 200);
});

Deno.test("over the limit answers 429 even when memories fail", async () => {
  const f = fake({ allow: 0 });
  f.deps.memories = () => Promise.reject(new Error("db"));
  assertEquals((await handle(post(fixture("line")), f.deps)).status, 429);
});

Deno.test("failing memories within the limit answer 502", async () => {
  const f = fake();
  f.deps.memories = () => Promise.reject(new Error("db"));
  assertEquals((await handle(post(fixture("line")), f.deps)).status, 502);
});

Deno.test("background work goes to the edge runtime when there is one", async () => {
  const kept: Promise<unknown>[] = [];
  const task = Promise.resolve();
  inBackground({ waitUntil: (p: Promise<unknown>) => void kept.push(p) })(task);
  assertEquals(kept, [task]);
  inBackground(undefined)(Promise.resolve());
  await task;
});

Deno.test("a fallback line is delivered calm", async () => {
  const leak = "I have pocket kings, sorry.";
  const f = fake({ texts: [leak, leak] });
  const res = await handle(post(fixture("line")), f.deps);
  const body = await json(res);
  assert(FALLBACK_LINES.includes(body.text as string));
  assertEquals(body.delivery, { emotion: "calm", intensity: 0 });
});

Deno.test("a spoken answer clamps its intensity and falls back on an unknown emotion", () => {
  assertEquals(parseSpoken({ text: " Hi. ", delivery: { emotion: "joy", intensity: 3 } }, ""), {
    text: "Hi.",
    delivery: { emotion: "joy", intensity: 1 },
  });
  assertEquals(parseSpoken({ text: "Hi.", delivery: { emotion: "glee", intensity: 0.5 } }, ""), {
    text: "Hi.",
    delivery: { emotion: "calm", intensity: 0 },
  });
  assertEquals(parseSpoken(undefined, " plain "), {
    text: "plain",
    delivery: { emotion: "calm", intensity: 0 },
  });
});
