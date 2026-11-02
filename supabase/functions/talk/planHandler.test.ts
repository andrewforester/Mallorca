import { assert, assertEquals, assertIncludes } from "../_shared/testing.ts";
import { fixture } from "./fixtures/fixtures.ts";
import { handle } from "./handler.ts";
import { ACT_FALLBACK } from "./planHandler.ts";
import { fake, post } from "./testDeps.ts";

type Json = Record<string, unknown>;

const json = async (res: Response): Promise<Json> => await res.json();

function line(maxWords = 7, extra: Json = {}): Json {
  const body = fixture("planLine");
  const plan = body.plan as Json;
  return { ...body, ...extra, plan: { ...plan, words: { min: 1, max: maxWords } } };
}

const lastContent = (input: { messages: { content: string }[] }): string =>
  input.messages[input.messages.length - 1].content;

Deno.test("returns a planned line that passes with one attempt", async () => {
  const f = fake({ texts: ["Ну конечно."] });
  const res = await handle(post(line()), f.deps);
  assertEquals(res.status, 200);
  const body = await json(res);
  assertEquals(body, { text: "Ну конечно.", attempts: [{ text: "Ну конечно.", rejected: [] }] });
  await Promise.all(f.tasks);
  assertEquals(f.saved, [[{ speaker: "mallorca", text: "Ну конечно." }]]);
});

Deno.test("asks once more with the reasons of a rejected line", async () => {
  const f = fake({ texts: ["Ну что ж, бывает и такое, да.", "Бывает."] });
  const body = await json(await handle(post(line(4)), f.deps));
  assertEquals(body.text, "Бывает.");
  assertEquals(body.attempts, [
    { text: "Ну что ж, бывает и такое, да.", rejected: ["longer than 4 words"] },
    { text: "Бывает.", rejected: [] },
  ]);
  const lines = f.inputs.filter((i) => i.purpose === "line");
  assertEquals(lines.length, 2);
  assertIncludes(lastContent(lines[1]), "Your last try was rejected: longer than 4 words.");
});

Deno.test("stays silent when a line fails twice, and saves nothing", async () => {
  const f = fake({ texts: ["one two three four five six", "one two three four five six seven"] });
  const body = await json(await handle(post(line(4)), f.deps));
  assertEquals(body.text, null);
  assertEquals((body.attempts as unknown[]).length, 2);
  await Promise.all(f.tasks);
  assertEquals(f.saved, []);
});

Deno.test("answers the player with the fallback of the act when both tries fail", async () => {
  const f = fake({
    texts: ["one two three four five six seven eight nine ten eleven twelve thirteen"],
  });
  const reply = fixture("planReply");
  const body = await json(await handle(post(reply), f.deps));
  assertEquals(body.text, ACT_FALLBACK.ru.answer);
  assertEquals(body.signals, []);
});

Deno.test("answers in English for a locale without its own fallback", async () => {
  const f = fake({
    texts: ["one two three four five six seven eight nine ten eleven twelve thirteen"],
  });
  const reply = { ...fixture("planReply"), locale: "de-DE" };
  const body = await json(await handle(post(reply), f.deps));
  assertEquals(body.text, ACT_FALLBACK.en.answer);
});

Deno.test("echoes the prompt only for a debug request", async () => {
  const plain = await json(await handle(post(line()), fake().deps));
  assert(!("prompt" in plain));
  const debug = await json(await handle(post(line(7, { debug: true })), fake().deps));
  const prompt = debug.prompt as Json;
  assertIncludes(prompt.system as string, "You are a bit outgoing");
  assertIncludes(prompt.state as string, "Act: complain");
});

Deno.test("still answers a body of version 1 with its delivery", async () => {
  const body = await json(await handle(post(fixture("line")), fake().deps));
  assert("delivery" in body);
  assert(!("attempts" in body));
});

Deno.test("is silent over the limit for version 2 too", async () => {
  const res = await handle(post(line()), fake({ allow: 0 }).deps);
  assertEquals(res.status, 429);
});

Deno.test("has a short fallback of every act in both languages", () => {
  for (const lang of ["en", "ru"] as const) {
    for (const text of Object.values(ACT_FALLBACK[lang])) {
      assert(text.length > 0 && text.split(" ").length <= 3, text);
    }
  }
});
