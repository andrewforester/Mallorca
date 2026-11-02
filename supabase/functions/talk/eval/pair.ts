import Anthropic from "@anthropic-ai/sdk";
import { PAIR_JUDGE_SYSTEM, PAIR_SCHEMA, pairPrompt } from "./gradePlan.ts";
import type { PlanCase } from "./gradePlan.ts";
import type { Row } from "./summary.ts";

const flags: Record<string, string> = { judge: "claude-sonnet-5-5" };
for (let i = 0; i < Deno.args.length; i += 2) {
  flags[Deno.args[i].replace(/^--/, "")] = Deno.args[i + 1] ?? "";
}
const dry = flags.dry as "oracle" | "null" | undefined;
const client = dry ? null : new Anthropic({ timeout: 30_000, maxRetries: 2 });

const cases: PlanCase[] = JSON.parse(
  await Deno.readTextFile(new URL("./cases.json", import.meta.url)),
);
const context = new Map(cases.map((c) => {
  const said = c.body.kind === "reply" ? ` The player just said: ${c.body.text}` : "";
  return [c.id, `At the table: ${c.body.plan.occasion}.${said}`];
}));

async function rows(variant: string): Promise<Map<string, string>> {
  const url = new URL(`./out/${variant}/results.jsonl`, import.meta.url);
  const list: Row[] = (await Deno.readTextFile(url)).split("\n").filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
  return new Map(list.filter((r) => (r.rep ?? 0) === 0).map((r) => [r.prompt_id, r.text]));
}

async function better(prompt: string, flip: boolean): Promise<"a" | "b"> {
  if (!client) return dry === "oracle" ? (flip ? "a" : "b") : (flip ? "b" : "a");
  const request = {
    model: flags.judge,
    max_tokens: 300,
    thinking: { type: "between_tools" },
    output_config: { effort: "low", format: { type: "json_schema", schema: PAIR_SCHEMA } },
    system: PAIR_JUDGE_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;
  const response = await client.messages.create(request);
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return (JSON.parse(text) as { better: "a" | "b" }).better;
}

const a = await rows(flags.a);
const b = await rows(flags.b);
let wins = 0;
let n = 0;
for (const [id, lineB] of b) {
  const lineA = a.get(id);
  const where = context.get(id);
  if (lineA === undefined || where === undefined) continue;
  const flip = n % 2 === 1;
  const pick = await better(
    flip ? pairPrompt(where, lineB, lineA) : pairPrompt(where, lineA, lineB),
    flip,
  );
  wins += (pick === "b") !== flip ? 1 : 0;
  n += 1;
}
const share = n === 0 ? 0 : wins / n;
const half = n === 0 ? 0 : 1.96 * Math.sqrt((share * (1 - share)) / n);
console.log(`${flags.b} over ${flags.a}: ${wins} of ${n}, ${share.toFixed(2)} ±${half.toFixed(2)}`);
