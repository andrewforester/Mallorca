import { createClient } from "@supabase/supabase-js";
import { corsHeaders, parseOrigins, preflight } from "./cors.ts";
import { handleSafely, inBackground } from "./handler.ts";
import type { Deps } from "./handler.ts";
import { createComplete } from "./model.ts";
import {
  DEFAULT_DAILY_LIMIT,
  DEFAULT_GLOBAL_DAILY_LIMIT,
  MEMORY_LIMIT,
} from "../_shared/limits.ts";

const numberFrom = (name: string, fallback: number): number => {
  const value = Number(Deno.env.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const origins = parseOrigins(Deno.env.get("TALK_ALLOWED_ORIGINS"));
const userLimit = numberFrom("TALK_DAILY_LIMIT", DEFAULT_DAILY_LIMIT);
const globalLimit = numberFrom("TALK_GLOBAL_DAILY_LIMIT", DEFAULT_GLOBAL_DAILY_LIMIT);

const deps: Deps = {
  async userId(req) {
    const header = req.headers.get("authorization") ?? "";
    const jwt = header.replace(/^Bearer\s+/i, "");
    if (jwt === "") return null;
    const { data, error } = await supabase.auth.getUser(jwt);
    return error || !data.user ? null : data.user.id;
  },
  async consume(userId) {
    const { data, error } = await supabase.rpc("consume_call", {
      p_user: userId,
      user_limit: userLimit,
      global_limit: globalLimit,
    });
    if (error) throw error;
    return data === true;
  },
  async memories(userId) {
    const { data, error } = await supabase.from("memories").select("fact").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(MEMORY_LIMIT);
    if (error) throw error;
    return (data ?? []).map((row: { fact: string }) => row.fact);
  },
  async saveLines(userId, sessionId, lines) {
    const rows = lines.map((line) => ({ user_id: userId, session_id: sessionId, ...line }));
    const { error } = await supabase.from("talk_lines").insert(rows);
    if (error) throw error;
  },
  async saveFacts(userId, facts) {
    const rows = facts.map((fact) => ({ user_id: userId, fact }));
    const { error } = await supabase.from("memories").insert(rows);
    if (error) throw error;
  },
  complete: createComplete(Deno.env.get("ANTHROPIC_API_KEY")),
  background: inBackground(
    (globalThis as { EdgeRuntime?: { waitUntil(task: Promise<unknown>): void } }).EdgeRuntime,
  ),
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req, origins);
  const res = await handleSafely(req, deps);
  for (const [key, value] of Object.entries(corsHeaders(req.headers.get("Origin"), origins))) {
    res.headers.set(key, value);
  }
  return res;
});
