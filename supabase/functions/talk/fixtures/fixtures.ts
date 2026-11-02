import line from "./line.json" with { type: "json" };
import planLine from "./planLine.json" with { type: "json" };
import planReply from "./planReply.json" with { type: "json" };
import reply from "./reply.json" with { type: "json" };
import summary from "./summary.json" with { type: "json" };

const FIXTURES = { line, reply, summary, planLine, planReply };

export const fixture = (name: keyof typeof FIXTURES): Record<string, unknown> =>
  structuredClone(FIXTURES[name]);
