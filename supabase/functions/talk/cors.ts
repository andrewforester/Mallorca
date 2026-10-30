export const DEFAULT_ORIGINS: readonly string[] = [
  "http://localhost:5173",
  "http://localhost:4173",
  "https://andrewforester.github.io",
  "https://*.vercel.app",
];

const ALLOWED_HEADERS = "authorization, content-type, apikey, x-client-info";

export function parseOrigins(value: string | undefined): readonly string[] {
  const list = (value ?? "").split(",").map((part) => part.trim()).filter((part) => part !== "");
  return list.length > 0 ? list : DEFAULT_ORIGINS;
}

function matches(origin: string, pattern: string): boolean {
  if (!pattern.includes("*")) return origin === pattern;
  const [prefix, suffix] = pattern.split("*");
  if (!origin.startsWith(prefix) || !origin.endsWith(suffix)) return false;
  const middle = origin.slice(prefix.length, origin.length - suffix.length);
  return middle.length > 0 && /^[a-z0-9-]+(\.[a-z0-9-]+)*$/i.test(middle);
}

export function corsHeaders(
  origin: string | null,
  allowed: readonly string[],
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin !== null && allowed.some((pattern) => matches(origin, pattern))) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function preflight(req: Request, allowed: readonly string[]): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("Origin"), allowed),
  });
}
