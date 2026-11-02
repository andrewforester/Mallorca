import line from "./line.json" with { type: "json" };
import reply from "./reply.json" with { type: "json" };
import summary from "./summary.json" with { type: "json" };

const FIXTURES = { line, reply, summary };

export const fixture = (name: keyof typeof FIXTURES): Record<string, unknown> =>
  structuredClone(FIXTURES[name]);
