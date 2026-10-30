import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCards } from '../cards/index.ts';
import { CALM } from '../talk/index.ts';
import type { HandFacts, LineIntent } from '../talk/index.ts';
import {
  TALK_TIMEOUT_MS,
  remoteTalkClient,
  silentTalkClient,
  toLinePayload,
  toReplyPayload,
  toSummaryPayload,
} from './talkClient.ts';

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`../../../supabase/functions/talk/fixtures/${name}.json`, import.meta.url),
      'utf8',
    ),
  );

function shapeOf(value: unknown): unknown {
  if (Array.isArray(value)) return value.length === 0 ? [] : [shapeOf(value[0])];
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, shapeOf(item)]),
    );
  }
  return value === null ? 'null' : typeof value;
}

const facts: HandFacts = {
  street: 'river',
  board: parseCards('Kd 7s 2c Th 4h'),
  pot: 24,
  stacks: [88, 112],
  her: parseCards('Ks Qd') as [number, number],
  actions: ['Mallorca bets 12 on the river'],
  bigBlind: 2,
};

const intent: LineIntent = {
  situation: 'herBet',
  hint: 'strong',
  honest: true,
  strength: 'strong',
  street: 'river',
  handNumber: 3,
};

const recent = [
  { speaker: 'mallorca' as const, text: 'Another cup of tea?' },
  { speaker: 'player' as const, text: 'Only if you stop winning.' },
];

const base = {
  sessionId: 's1',
  locale: 'en',
  facts,
  intent,
  mood: { ...CALM, cheer: 0.8, form: 0.9 },
  recent,
};

describe('payload builders', () => {
  it('caps recent text and session id and normalises the locale', () => {
    const payload = toLinePayload({
      ...base,
      sessionId: 's'.repeat(100),
      locale: 'en_US',
      recent: [{ speaker: 'player', text: 'z'.repeat(500) }],
    });
    expect(payload.recent[0]?.text).toHaveLength(400);
    expect(payload.sessionId).toHaveLength(64);
    expect(payload.locale).toBe('en-US');
    expect(toLinePayload({ ...base, locale: 'not a locale!' }).locale).toBe('en');
    const summary = { hands: 0, netBb: 0, playerBluffsShown: 0, playerAllIns: 0, signals: {} };
    expect(toSummaryPayload({ sessionId: 'x'.repeat(80), locale: 'x', summary }).locale).toBe('en');
  });

  it('does not append the reply text to recent', () => {
    const payload = toReplyPayload({ ...base, text: 'secret question' });
    expect(payload.recent).toEqual(recent);
    expect(payload.recent.some((turn) => turn.text === 'secret question')).toBe(false);
  });

  it('line payload has the shape of the line fixture', () => {
    const payload = toLinePayload(base);
    expect(shapeOf(payload)).toEqual(shapeOf(fixture('line')));
    expect(payload.facts.board).toEqual(['Kd', '7s', '2c', 'Th', '4h']);
    expect(payload.facts.her).toEqual(['Ks', 'Qd']);
    expect(payload.intent).toEqual({ situation: 'herBet', hint: 'strong', honest: true });
  });

  it('reply payload has the shape of the reply fixture and trims the text', () => {
    const payload = toReplyPayload({ ...base, text: '  you bluff  ' });
    expect(shapeOf(payload)).toEqual(shapeOf(fixture('reply')));
    expect(payload.text).toBe('you bluff');
  });

  it('summary payload has the shape of the summary fixture', () => {
    const summary = {
      hands: 5,
      netBb: -1.5,
      playerBluffsShown: 1,
      playerAllIns: 0,
      signals: { tease: 4, compliment: 1, mockBluff: 2 },
    };
    const payload = toSummaryPayload({ sessionId: 's1', locale: 'en', summary });
    expect(shapeOf(payload)).toEqual(shapeOf(fixture('summary')));
  });

  it('keeps a hidden hand null and a null hint', () => {
    const payload = toLinePayload({
      ...base,
      facts: { ...facts, her: null },
      intent: { ...intent, hint: null },
    });
    expect(payload.facts.her).toBeNull();
    expect(payload.intent.hint).toBeNull();
  });

  it('caps recent turns, actions, action length and reply text, and drops blank turns', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      speaker: 'player' as const,
      text: `t${i}`,
    }));
    const lines = toLinePayload({
      ...base,
      recent: [...many, { speaker: 'mallorca', text: '   ' }],
    });
    expect(lines.recent).toHaveLength(8);
    expect(lines.recent[7]?.text).toBe('t11');
    const actions = Array.from({ length: 40 }, (_, i) => `a${i}${'x'.repeat(100)}`);
    const capped = toLinePayload({ ...base, facts: { ...facts, actions } });
    expect(capped.facts.actions).toHaveLength(30);
    expect(capped.facts.actions[29]?.startsWith('a39')).toBe(true);
    expect(capped.facts.actions.every((a) => a.length <= 80)).toBe(true);
    expect(toReplyPayload({ ...base, text: 'y'.repeat(500) }).text).toHaveLength(200);
  });
});

const URL_BASE = 'https://proj.supabase.co';

function authResponse(): Response {
  const session = {
    access_token: 'tok-1',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'ref-1',
    user: {
      id: 'u1',
      aud: 'authenticated',
      is_anonymous: true,
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    },
  };
  return new Response(JSON.stringify(session), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(talk: (call: Call) => Promise<Response>, calls: Call[] = []): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const call = { url, init };
    calls.push(call);
    if (url.includes('/auth/v1/')) return Promise.resolve(authResponse());
    return talk(call);
  }) as typeof fetch;
}

const json = (body: unknown, status = 200): Promise<Response> =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

afterEach(() => {
  vi.useRealTimers();
});

describe('silentTalkClient', () => {
  it('is disabled and resolves null', async () => {
    expect(silentTalkClient.enabled).toBe(false);
    expect(await silentTalkClient.line(toLinePayload(base))).toBeNull();
    expect(await silentTalkClient.reply(toReplyPayload({ ...base, text: 'hi' }))).toBeNull();
    await expect(
      silentTalkClient.summary(
        toSummaryPayload({
          sessionId: 's',
          locale: 'en',
          summary: { hands: 0, netBb: 0, playerBluffsShown: 0, playerAllIns: 0, signals: {} },
        }),
      ),
    ).resolves.toBeUndefined();
  });
});

describe('remoteTalkClient', () => {
  it('signs in anonymously and posts with the bearer token', async () => {
    const calls: Call[] = [];
    const client = await remoteTalkClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: fakeFetch(() => json({ text: 'Nice hand.' }), calls),
    });
    expect(client.enabled).toBe(true);
    expect(await client.line(toLinePayload(base))).toBe('Nice hand.');
    const talk = calls.find((c) => c.url === `${URL_BASE}/functions/v1/talk`);
    const headers = new Headers(talk?.init?.headers);
    expect(talk?.init?.method).toBe('POST');
    expect(headers.get('authorization')).toBe('Bearer tok-1');
    expect(headers.get('apikey')).toBe('anon');
    expect(JSON.parse(String(talk?.init?.body)).kind).toBe('line');
  });

  it('parses replies and filters unknown signals', async () => {
    const client = await remoteTalkClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: fakeFetch(() => json({ text: 'Hm.', signals: ['tease', 'bogus', 7] })),
    });
    expect(await client.reply(toReplyPayload({ ...base, text: 'x' }))).toEqual({
      text: 'Hm.',
      signals: ['tease'],
    });
  });

  it('turns 429, errors, empty text and malformed bodies into null', async () => {
    const answers = [
      json({ silent: true }, 429),
      json({}, 502),
      json({ text: '' }),
      json({ text: 5 }),
      Promise.reject(new Error('net')),
    ];
    let i = 0;
    const client = await remoteTalkClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: fakeFetch(() => answers[i++] as Promise<Response>),
    });
    for (let n = 0; n < answers.length; n += 1) {
      expect(await client.line(toLinePayload(base))).toBeNull();
    }
  });

  it('resolves null after the timeout when the request hangs', async () => {
    vi.useFakeTimers();
    const hang = (call: Call): Promise<Response> =>
      new Promise((_, reject) => {
        call.init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const client = await remoteTalkClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: fakeFetch(hang),
    });
    const pending = client.line(toLinePayload(base));
    await vi.advanceTimersByTimeAsync(TALK_TIMEOUT_MS);
    expect(await pending).toBeNull();
  });

  it('resolves null when the token lookup hangs past the timeout', async () => {
    vi.useFakeTimers();
    let hang = false;
    const stalled = ((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/auth/v1/') && hang) return new Promise<Response>(() => undefined);
      return Promise.resolve(authResponse());
    }) as typeof fetch;
    const client = await remoteTalkClient({ url: URL_BASE, anonKey: 'anon', fetch: stalled });
    hang = true;
    vi.setSystemTime(Date.now() + 2 * 3600 * 1000);
    const pending = client.line(toLinePayload(base));
    await vi.advanceTimersByTimeAsync(TALK_TIMEOUT_MS);
    expect(await pending).toBeNull();
  });

  it('summary swallows failures', async () => {
    const client = await remoteTalkClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: fakeFetch(() => json({}, 500)),
    });
    const summary = { hands: 1, netBb: 0, playerBluffsShown: 0, playerAllIns: 0, signals: {} };
    await expect(
      client.summary(toSummaryPayload({ sessionId: 's', locale: 'en', summary })),
    ).resolves.toBeUndefined();
  });

  it('returns the silent client when sign-in fails', async () => {
    const failing = (() =>
      Promise.resolve(new Response('{"msg":"no"}', { status: 500 }))) as typeof fetch;
    const client = await remoteTalkClient({ url: URL_BASE, anonKey: 'anon', fetch: failing });
    expect(client).toBe(silentTalkClient);
  });

  it('returns the silent client when the network throws', async () => {
    const throwing = (() => Promise.reject(new Error('offline'))) as typeof fetch;
    const client = await remoteTalkClient({ url: URL_BASE, anonKey: 'anon', fetch: throwing });
    expect(client.enabled).toBe(false);
  });
});

describe('mood words', () => {
  it('maps the mood to words', () => {
    expect(toLinePayload(base).mood).toEqual(['on a winning streak', 'in a good mood']);
  });
});
