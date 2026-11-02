import Anthropic from "@anthropic-ai/sdk";
import { handle } from "../handler.ts";
import type { Deps } from "../handler.ts";
import { completeWith, createFrom } from "../model.ts";
import type { BigFive } from "../planTypes.ts";
import {
  correlation,
  TRAIT_JUDGE_SYSTEM,
  TRAIT_SCHEMA,
  traitPrompt,
  traitsOf,
} from "./gradePlan.ts";
import type { PlanCase } from "./gradePlan.ts";

const flags: Record<string, string> = {
  model: "claude-haiku-5-5",
  judge: "claude-sonnet-5-5",
  lines: "20",
};
for (let i = 0; i < Deno.args.length; i += 2) {
  flags[Deno.args[i].replace(/^--/, "")] = Deno.args[i + 1] ?? "";
}
const dry = flags.dry as "oracle" | "null" | undefined;
const client = dry ? null : new Anthropic({ timeout: 30_000, maxRetries: 2 });

const cases: PlanCase[] = JSON.parse(
  await Deno.readTextFile(new URL("./cases.json", import.meta.url)),
);
const presets: Record<string, BigFive> = JSON.parse(
  await Deno.readTextFile(new URL("./presets.json", import.meta.url)),
);
const own = cases.filter((c) => c.tags[1] === "mallorca");

function fake(text: string): Anthropic.Message {
  return {
    model: flags.model,
    stop_reason: "end_turn",
    usage: { input_tokens: 0, output_tokens: 0 },
    content: [{ type: "text", text }],
  } as unknown as Anthropic.Message;
}

const deps: Deps = {
  userId: () => Promise.resolve("eval"),
  consume: () => Promise.resolve(true),
  memories: () => Promise.resolve([]),
  saveLines: () => Promise.resolve(),
  saveFacts: () => Promise.resolve(),
  complete: completeWith(
    client ? createFrom(client) : () => Promise.resolve(fake("Hm.")),
    flags.model,
  ),
  background: () => {},
};

async function lineOf(c: PlanCase, personality: BigFive): Promise<string> {
  const body = { ...c.body, personality };
  const response = await handle(
    new Request("http://eval/talk", { method: "POST", body: JSON.stringify(body) }),
    deps,
  );
  const answer = await response.json();
  return answer.attempts?.[0]?.text ?? "";
}

async function rate(lines: string[], given: BigFive): Promise<BigFive> {
  if (!client) {
    return dry === "oracle"
      ? given
      : { openness: 0, conscientiousness: 0, extraversion: 0, agreeableness: 0, neuroticism: 0 };
  }
  const request = {
    model: flags.judge,
    max_tokens: 400,
    thinking: { type: "between_tools" },
    output_config: { effort: "low", format: { type: "json_schema", schema: TRAIT_SCHEMA } },
    system: TRAIT_JUDGE_SYSTEM,
    messages: [{ role: "user", content: traitPrompt(lines) }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;
  const response = await client.messages.create(request);
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return JSON.parse(text) as BigFive;
}

const given: number[] = [];
const judged: number[] = [];
const report: Record<string, { given: BigFive; judged: BigFive; lines: string[] }> = {};
for (const [name, personality] of Object.entries(presets)) {
  const lines: string[] = [];
  for (let i = 0; i < Number(flags.lines); i++) {
    lines.push(await lineOf(own[i % own.length], personality));
  }
  const read = await rate(lines, personality);
  report[name] = { given: personality, judged: read, lines };
  given.push(...traitsOf(personality));
  judged.push(...traitsOf(read));
  console.log(
    `${name.padEnd(9)} given ${traitsOf(personality).join(" ")} read ${traitsOf(read).join(" ")}`,
  );
}
const r = correlation(given, judged);
await Deno.mkdir(new URL("./out/character/", import.meta.url), { recursive: true });
await Deno.writeTextFile(
  new URL(`./out/character/${flags.variant ?? "scratch"}.json`, import.meta.url),
  JSON.stringify({ r, report }, null, 2),
);
console.log(`trait correlation r = ${r.toFixed(2)} over ${given.length} values`);
