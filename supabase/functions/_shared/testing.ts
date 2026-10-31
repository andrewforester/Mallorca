export function assert(condition: unknown, message = "expected a truthy value"): asserts condition {
  if (!condition) throw new Error(message);
}

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  const entries = Object.entries(value).sort(([x], [y]) => (x < y ? -1 : 1));
  return Object.fromEntries(entries.map(([k, v]) => [k, canonical(v)]));
};

export function assertEquals<T>(actual: T, expected: T, message = ""): void {
  const a = JSON.stringify(canonical(actual));
  const b = JSON.stringify(canonical(expected));
  if (a !== b) throw new Error(`${message}\n  actual:   ${a}\n  expected: ${b}`);
}

export function assertIncludes(text: string, part: string): void {
  if (!text.includes(part)) throw new Error(`expected to find ${JSON.stringify(part)} in\n${text}`);
}

export function assertExcludes(text: string, part: string): void {
  if (text.includes(part)) {
    throw new Error(`expected not to find ${JSON.stringify(part)} in\n${text}`);
  }
}
