import { assertEquals } from "../_shared/testing.ts";
import { corsHeaders, DEFAULT_ORIGINS, parseOrigins, preflight } from "./cors.ts";

Deno.test("an allowed origin is echoed with the allowed headers", () => {
  const headers = corsHeaders("http://localhost:5173", DEFAULT_ORIGINS);
  assertEquals(headers["Access-Control-Allow-Origin"], "http://localhost:5173");
  assertEquals(
    headers["Access-Control-Allow-Headers"],
    "authorization, content-type, apikey, x-client-info",
  );
  assertEquals(headers["Vary"], "Origin");
});

Deno.test("the pages origin, the vercel production domain and its previews are allowed", () => {
  for (
    const origin of [
      "https://andrewforester.github.io",
      "https://mallorca-omega.vercel.app",
      "https://mallorca-u5ou0auw0-andriipanasiuks-projects.vercel.app",
      "https://mallorca-git-feat-table-talk-andriipanasiuks-projects.vercel.app",
    ]
  ) {
    assertEquals(corsHeaders(origin, DEFAULT_ORIGINS)["Access-Control-Allow-Origin"], origin);
  }
});

Deno.test("other vercel projects are not allowed", () => {
  for (
    const origin of [
      "https://mallorca-abc.vercel.app",
      "https://other-andriipanasiuks-projects.vercel.app",
      "https://mallorca-x-someone-elses-projects.vercel.app",
    ]
  ) {
    assertEquals(corsHeaders(origin, DEFAULT_ORIGINS)["Access-Control-Allow-Origin"], undefined);
  }
});

Deno.test("an unknown or missing origin gets no allow-origin header", () => {
  for (const origin of ["https://evil.example", "https://evilvercel.app", null]) {
    assertEquals(corsHeaders(origin, DEFAULT_ORIGINS)["Access-Control-Allow-Origin"], undefined);
  }
});

Deno.test("a vercel wildcard does not match the bare domain or a lookalike", () => {
  const origin = "https://vercel.app";
  assertEquals(corsHeaders(origin, DEFAULT_ORIGINS)["Access-Control-Allow-Origin"], undefined);
  const lookalike = "https://x.vercel.app.evil.com";
  assertEquals(corsHeaders(lookalike, DEFAULT_ORIGINS)["Access-Control-Allow-Origin"], undefined);
});

Deno.test("origins come from a comma separated setting, trimmed", () => {
  assertEquals(parseOrigins(" https://a.example , https://b.example ,, "), [
    "https://a.example",
    "https://b.example",
  ]);
  assertEquals(parseOrigins(undefined), DEFAULT_ORIGINS);
  assertEquals(parseOrigins("  "), DEFAULT_ORIGINS);
});

Deno.test("a preflight answers 204 with the cors headers", () => {
  const req = new Request("https://f.example/talk", {
    method: "OPTIONS",
    headers: { Origin: "http://localhost:4173" },
  });
  const res = preflight(req, DEFAULT_ORIGINS);
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:4173");
  assertEquals(res.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
});
