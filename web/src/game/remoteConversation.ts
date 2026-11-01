import { createClient } from '@supabase/supabase-js';
import { SIGNALS } from '../persona/index.ts';
import type { Signal } from '../persona/index.ts';
import { CONVERSATION_TIMEOUT_MS, silentConversationClient } from './conversationClient.ts';
import type { ConversationClient, ConversationReply } from './conversationClient.ts';

export interface RemoteOptions {
  url: string;
  anonKey: string;
  fetch?: typeof fetch;
}

type Tokens = () => Promise<string | null>;

interface TokenCache {
  latest(): string | null;
  fresh: Tokens;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSignals(value: unknown): Signal[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Signal => (SIGNALS as readonly unknown[]).includes(item));
}

function parseReply(body: unknown): ConversationReply | null {
  if (!isRecord(body) || typeof body.text !== 'string' || body.text.trim() === '') return null;
  return { text: body.text, signals: parseSignals(body.signals) };
}

function aborted(signal: AbortSignal): Promise<null> {
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve(null));
  });
}

function cache(tokens: Tokens, first: string | null): TokenCache {
  let latest = first;
  return {
    latest: () => latest,
    fresh: async () => {
      latest = await tokens();
      return latest;
    },
  };
}

function headersOf(options: RemoteOptions, token: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    apikey: options.anonKey,
  };
}

async function beacon(options: RemoteOptions, token: string | null, payload: unknown) {
  if (token === null) return;
  const send = options.fetch ?? fetch;
  await send(`${options.url}/functions/v1/talk`, {
    method: 'POST',
    headers: headersOf(options, token),
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}

async function post(options: RemoteOptions, tokens: Tokens, payload: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONVERSATION_TIMEOUT_MS);
  try {
    const token = await Promise.race([tokens(), aborted(controller.signal)]);
    if (token === null) return null;
    const send = options.fetch ?? fetch;
    const response = await send(`${options.url}/functions/v1/talk`, {
      method: 'POST',
      headers: headersOf(options, token),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return response.ok ? ((await response.json()) as unknown) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function connected(options: RemoteOptions, tokens: TokenCache): ConversationClient {
  const { fresh } = tokens;
  return {
    enabled: true,
    line: async (request) => parseReply(await post(options, fresh, request))?.text ?? null,
    reply: async (request) => parseReply(await post(options, fresh, request)),
    summary: async (request, send) => {
      if (send?.keepalive === true) return beacon(options, tokens.latest(), request);
      await post(options, fresh, request);
    },
  };
}

async function signIn(options: RemoteOptions): Promise<Tokens | null> {
  const client = createClient(options.url, options.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
    global: options.fetch === undefined ? {} : { fetch: options.fetch },
  });
  const existing = await client.auth.getSession();
  if (existing.data.session === null) {
    const created = await client.auth.signInAnonymously();
    if (created.error !== null || created.data.session === null) return null;
  }
  return async () => (await client.auth.getSession()).data.session?.access_token ?? null;
}

export async function remoteConversationClient(
  options: RemoteOptions,
): Promise<ConversationClient> {
  try {
    const tokens = await signIn(options);
    return tokens === null
      ? silentConversationClient
      : connected(options, cache(tokens, await tokens()));
  } catch {
    return silentConversationClient;
  }
}
