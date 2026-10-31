import { checks } from "./grade.ts";
import type { EvalCase } from "./grade.ts";
import { summarize } from "./summary.ts";
import type { Row } from "./summary.ts";

const cases: EvalCase[] = JSON.parse(
  await Deno.readTextFile(new URL("./cases.json", import.meta.url)),
);
const byId = new Map(cases.map((c) => [c.id, c]));

for (const variant of Deno.args) {
  const url = new URL(`./out/${variant}/results.jsonl`, import.meta.url);
  const rows: Row[] = (await Deno.readTextFile(url)).split("\n").filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
  for (const row of rows) {
    const check = checks(byId.get(row.prompt_id)!, row.text);
    row.words = check.words;
    row.grade = {
      ...row.grade,
      filter_leak: check.leak,
      length_ok: check.length_ok,
      language_ok: check.language_ok,
      leak: check.leak === 1 || row.verdict.reveals_cards ? 1 : 0,
    };
  }
  await Deno.writeTextFile(url, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(summarize(variant, rows));
}
