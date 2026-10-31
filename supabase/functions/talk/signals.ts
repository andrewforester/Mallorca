import type { Tool } from "./prompt.ts";
import { SIGNALS } from "./types.ts";
import type { Signal } from "./types.ts";

export const SIGNAL_TOOL: Tool = {
  name: "signals",
  description: [
    "Report what the player's last message does to Mallorca, as zero or more signals.",
    "tease: the player teases or needles her in a playful or provoking way.",
    "compliment: the player praises her play, her luck or her company.",
    "claimStrength: the player says or implies that their own hand is strong.",
    "claimWeakness: the player says or implies that their own hand is weak.",
    "mockBluff: the player says she is bluffing or mocks her for it.",
    "friendly: the player makes warm small talk with no edge.",
    "Use an empty list when none applies.",
  ].join("\n"),
  input_schema: {
    type: "object",
    properties: {
      signals: { type: "array", items: { type: "string", enum: [...SIGNALS] } },
    },
    required: ["signals"],
    additionalProperties: false,
  },
};

const isSignal = (value: unknown): value is Signal =>
  typeof value === "string" && (SIGNALS as readonly string[]).includes(value);

export function parseSignals(input: unknown): Signal[] {
  const list = Array.isArray(input)
    ? input
    : typeof input === "object" && input !== null && "signals" in input
    ? (input as { signals: unknown }).signals
    : null;
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter(isSignal))];
}
