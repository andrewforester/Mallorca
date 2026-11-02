import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCards } from '../cards/index.ts';
import {
  CONVERSATION_TIMEOUT_MS,
  silentConversationClient,
  toPlanLinePayload,
  toPlanReplyPayload,
  toSummaryPayload,
} from './conversationClient.ts';
import type { PlanInput } from './conversationClient.ts';
import type { UtterancePlan } from '../conversation/index.ts';
import { remoteConversationClient } from './remoteConversation.ts';

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

describe('payload builders', () => {
  it('caps recent text and session id and normalises the locale', () => {
    const payload = toPlanLinePayload({
      ...planInput,
      sessionId: 's'.repeat(100),
      locale: 'en_US',
      recent: [{ speaker: 'player', text: 'z'.repeat(500) }],
    });
    expect(payload.recent[0]?.text).toHaveLength(400);
    expect(payload.sessionId).toHaveLength(64);
    expect(payload.locale).toBe('en-US');
    expect(toPlanLinePayload({ ...planInput, locale: 'not a locale!' }).locale).toBe('en');
    const summary = {
      hands: 0,
      netBb: 0,
      playerBluffsShown: 0,
      playerAllIns: 0,
      signals: {},
      notable: [],
    };
    expect(toSummaryPayload({ sessionId: 'x'.repeat(80), locale: 'x', summary }).locale).toBe('en');
  });

  it('does not append the reply text to recent', () => {
    const payload = toPlanReplyPayload({ ...planInput, text: 'secret question' });
    expect(payload.recent).toEqual(planInput.recent);
    expect(payload.recent.some((turn) => turn.text === 'secret question')).toBe(false);
  });

  it('trims the reply text', () => {
    expect(toPlanReplyPayload({ ...planInput, text: '  hi  ' }).text).toBe('hi');
  });

  it('summary payload has the shape of the summary fixture', () => {
    const summary = {
      hands: 5,
      netBb: -1.5,
      playerBluffsShown: 1,
      playerAllIns: 0,
      signals: { tease: 4, compliment: 1, mockBluff: 2 },
      notable: [],
    };
    const payload = toSummaryPayload({ sessionId: 's1', locale: 'en', summary });
    expect(shapeOf(payload)).toEqual(shapeOf(fixture('summary')));
  });

  it('marks quick replies and leaves typed replies unmarked', () => {
    expect(toPlanReplyPayload({ ...planInput, text: 'Nice hand', quick: true }).quick).toBe(true);
    expect(toPlanReplyPayload({ ...planInput, text: 'Hello' }).quick).toBe(false);
  });

  it("sends the player's net, the opposite of hers", () => {
    const summary = {
      hands: 2,
      netBb: 7.5,
      playerBluffsShown: 0,
      playerAllIns: 0,
      signals: {},
      notable: [],
    };
    expect(toSummaryPayload({ sessionId: 's', locale: 'en', summary }).summary.netBb).toBe(-7.5);
    const even = toSummaryPayload({
      sessionId: 's',
      locale: 'en',
      summary: { ...summary, netBb: 0 },
    });
    expect(Object.is(even.summary.netBb, 0)).toBe(true);
  });

  it('sends the summary without her notable hands', () => {
    const summary = {
      hands: 3,
      netBb: 1,
      playerBluffsShown: 0,
      playerAllIns: 0,
      signals: {},
      notable: [{ kind: 'bigWin' as const, handNumber: 2, potBb: 30, won: true, bets: 2 }],
    };
    const sent = toSummaryPayload({ sessionId: 's', locale: 'en', summary }).summary;
    expect(Object.keys(sent).sort()).toEqual(
      ['hands', 'netBb', 'playerAllIns', 'playerBluffsShown', 'signals'].sort(),
    );
  });

  it('caps recent turns, actions, action length and reply text, and drops blank turns', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      speaker: 'player' as const,
      text: `t${i}`,
    }));
    const lines = toPlanLinePayload({
      ...planInput,
      recent: [...many, { speaker: 'mallorca', text: '   ' }],
    });
    expect(lines.recent).toHaveLength(8);
    expect(lines.recent[7]?.text).toBe('t11');
    const actions = Array.from({ length: 40 }, (_, i) => `a${i}${'x'.repeat(100)}`);
    const capped = toPlanLinePayload({
      ...planInput,
      plan: { ...plan, facts: { ...plan.facts, actions } },
    });
    expect(capped.plan.facts.actions).toHaveLength(30);
    expect(capped.plan.facts.actions[29]?.startsWith('a39')).toBe(true);
    expect(capped.plan.facts.actions.every((a) => a.length <= 80)).toBe(true);
    expect(toPlanReplyPayload({ ...planInput, text: 'y'.repeat(500) }).text).toHaveLength(200);
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

function fakeFetch(
  conversation: (call: Call) => Promise<Response>,
  calls: Call[] = [],
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const call = { url, init };
    calls.push(call);
    if (url.includes('/auth/v1/')) return Promise.resolve(authResponse());
    return conversation(call);
  }) as typeof fetch;
}

const json = (body: unknown, status = 200): Promise<Response> =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

afterEach(() => {
  vi.useRealTimers();
});

describe('silentConversationClient', () => {
  it('is disabled and resolves null', async () => {
    expect(silentConversationClient.enabled).toBe(false);
    expect(await silentConversationClient.planLine(toPlanLinePayload(planInput))).toBeNull();
    expect(
      await silentConversationClient.planReply(toPlanReplyPayload({ ...planInput, text: 'hi' })),
    ).toBeNull();
    await expect(
      silentConversationClient.summary(
        toSummaryPayload({
          sessionId: 's',
          locale: 'en',
          summary: {
            hands: 0,
            netBb: 0,
            playerBluffsShown: 0,
            playerAllIns: 0,
            signals: {},
            notable: [],
          },
        }),
      ),
    ).resolves.toBeUndefined();
  });
});

describe('remoteConversationClient', () => {
  it('signs in anonymously and posts with the bearer token', async () => {
    const calls: Call[] = [];
    const client = await remoteConversationClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: fakeFetch(() => json({ text: 'Nice hand.' }), calls),
    });
    expect(client.enabled).toBe(true);
    expect((await client.planLine(toPlanLinePayload(planInput)))?.text).toBe('Nice hand.');
    const conversation = calls.find((c) => c.url === `${URL_BASE}/functions/v1/talk`);
    const headers = new Headers(conversation?.init?.headers);
    expect(conversation?.init?.method).toBe('POST');
    expect(headers.get('authorization')).toBe('Bearer tok-1');
    expect(headers.get('apikey')).toBe('anon');
    expect(JSON.parse(String(conversation?.init?.body)).kind).toBe('line');
  });

  it('parses replies and filters unknown signals', async () => {
    const client = await remoteConversationClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: fakeFetch(() => json({ text: 'Hm.', signals: ['tease', 'bogus', 7] })),
    });
    expect(await client.planReply(toPlanReplyPayload({ ...planInput, text: 'x' }))).toEqual({
      text: 'Hm.',
      attempts: [],
      prompt: null,
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
    const client = await remoteConversationClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: fakeFetch(() => answers[i++] as Promise<Response>),
    });
    for (let n = 0; n < answers.length; n += 1) {
      expect(await client.planLine(toPlanLinePayload(planInput))).toBeNull();
    }
  });

  it('resolves null after the timeout when the request hangs', async () => {
    vi.useFakeTimers();
    const hang = (call: Call): Promise<Response> =>
      new Promise((_, reject) => {
        call.init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const client = await remoteConversationClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: fakeFetch(hang),
    });
    const pending = client.planLine(toPlanLinePayload(planInput));
    await vi.advanceTimersByTimeAsync(CONVERSATION_TIMEOUT_MS);
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
    const client = await remoteConversationClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: stalled,
    });
    hang = true;
    vi.setSystemTime(Date.now() + 2 * 3600 * 1000);
    const pending = client.planLine(toPlanLinePayload(planInput));
    await vi.advanceTimersByTimeAsync(CONVERSATION_TIMEOUT_MS);
    expect(await pending).toBeNull();
  });

  it('summary swallows failures', async () => {
    const client = await remoteConversationClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: fakeFetch(() => json({}, 500)),
    });
    const summary = {
      hands: 1,
      netBb: 0,
      playerBluffsShown: 0,
      playerAllIns: 0,
      signals: {},
      notable: [],
    };
    await expect(
      client.summary(toSummaryPayload({ sessionId: 's', locale: 'en', summary })),
    ).resolves.toBeUndefined();
  });

  it('sends a keepalive summary at once with the token it already has', async () => {
    const calls: Call[] = [];
    const client = await remoteConversationClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: fakeFetch(() => json({ facts: [] }), calls),
    });
    const before = calls.length;
    const summary = {
      hands: 1,
      netBb: 2,
      playerBluffsShown: 0,
      playerAllIns: 0,
      signals: {},
      notable: [],
    };
    void client.summary(toSummaryPayload({ sessionId: 's', locale: 'en', summary }), {
      keepalive: true,
    });
    expect(calls).toHaveLength(before + 1);
    const sent = calls.at(-1);
    expect(sent?.url).toBe(`${URL_BASE}/functions/v1/talk`);
    expect(sent?.init?.keepalive).toBe(true);
    expect(new Headers(sent?.init?.headers).get('authorization')).toBe('Bearer tok-1');
    expect(JSON.parse(String(sent?.init?.body)).summary.netBb).toBe(-2);
  });

  it('returns the silent client when sign-in fails', async () => {
    const failing = (() =>
      Promise.resolve(new Response('{"msg":"no"}', { status: 500 }))) as typeof fetch;
    const client = await remoteConversationClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: failing,
    });
    expect(client).toBe(silentConversationClient);
  });

  it('returns the silent client when the network throws', async () => {
    const throwing = (() => Promise.reject(new Error('offline'))) as typeof fetch;
    const client = await remoteConversationClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: throwing,
    });
    expect(client.enabled).toBe(false);
  });
});

const plan: UtterancePlan = {
  version: 2,
  act: 'complain',
  occasion: 'the river came Ah and you lost a 38 bb pot',
  voice: { emotion: 'injustice', intensity: 0.55 },
  words: { min: 2, max: 7 },
  humour: { style: 'selfEnhancing', target: 'self', intensity: 'soft', softened: false },
  claim: null,
  facts: {
    street: 'complete',
    board: parseCards('Kd 7s 2c 9h Ah'),
    potBb: 38,
    stacksBb: { her: 81, player: 119 },
    actions: ['player raises to 60'],
    card: null,
    result: { won: false, potBb: 38 },
    shown: {
      her: parseCards('Kc Ks') as [number, number],
      player: parseCards('Ac 7d') as [number, number],
    },
  },
  heard: null,
  session: {
    hands: 17,
    netBb: -12,
    playerBluffsShown: 1,
    playerAllIns: 0,
    notable: [{ kind: 'bigLoss', handNumber: 17, potBb: 38, won: false, bets: 2 }],
  },
  handNumber: 17,
  street: 'complete',
  actionStreet: 'river',
  endsHand: true,
};

const planInput: PlanInput = {
  sessionId: 's-123',
  locale: 'ru_RU',
  personality: {
    openness: 0.4,
    conscientiousness: 0.2,
    extraversion: 0.4,
    agreeableness: 0.5,
    neuroticism: 0.1,
  },
  plan,
  recent: [
    { speaker: 'player', text: 'Твой ход.' },
    { speaker: 'mallorca', text: 'Посмотрим.' },
  ],
  debug: false,
};

describe('the version 2 payloads', () => {
  it('match the shape the function reads', () => {
    expect(shapeOf(toPlanLinePayload(planInput))).toEqual(shapeOf(fixture('planLine')));
    const reply = toPlanReplyPayload({
      ...planInput,
      plan: {
        ...plan,
        act: 'answer',
        heard: 'Ты блефуешь?',
        claim: { about: 'strong', honest: false },
      },
      text: 'Ты блефуешь?',
    });
    expect(Object.keys(reply).sort()).toEqual(Object.keys(fixture('planReply') as object).sort());
  });

  it('carry the cards as text and the version', () => {
    const payload = toPlanLinePayload(planInput);
    expect(payload.version).toBe(2);
    expect(payload.locale).toBe('ru-RU');
    expect(payload.plan.facts.board).toEqual(['Kd', '7s', '2c', '9h', 'Ah']);
    expect(payload.plan.facts.shown).toEqual({ her: ['Kc', 'Ks'], player: ['Ac', '7d'] });
  });

  it('carry no hidden card of a live hand', () => {
    const live: UtterancePlan = {
      ...plan,
      facts: { ...plan.facts, shown: null, result: null, street: 'river' },
    };
    const text = JSON.stringify(toPlanLinePayload({ ...planInput, plan: live }));
    expect(text).not.toMatch(/"Kc"|"Ks"/);
  });

  it('trim long text to the limits of the function', () => {
    const long: UtterancePlan = {
      ...plan,
      occasion: 'x'.repeat(300),
      facts: { ...plan.facts, actions: Array.from({ length: 40 }, () => 'y'.repeat(100)) },
    };
    const payload = toPlanLinePayload({ ...planInput, plan: long });
    expect(payload.plan.occasion.length).toBe(200);
    expect(payload.plan.facts.actions).toHaveLength(30);
    expect(payload.plan.facts.actions[0]?.length).toBe(80);
  });
});

describe('the version 2 answers', () => {
  it('read the text, the attempts and the prompt', async () => {
    const attempts = [{ text: 'Слишком длинно вышло тут.', rejected: ['longer than 4 words'] }];
    const client = await remoteConversationClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: fakeFetch(() => json({ text: null, attempts, prompt: { system: 'S', state: 'T' } })),
    });
    expect(await client.planLine(toPlanLinePayload(planInput))).toEqual({
      text: null,
      attempts,
      prompt: { system: 'S', state: 'T' },
    });
  });

  it('read a reply with its signals and an answer without attempts', async () => {
    const client = await remoteConversationClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: fakeFetch(() => json({ text: 'Хм.', signals: ['tease', 'bogus'] })),
    });
    expect(await client.planReply(toPlanReplyPayload({ ...planInput, text: 'x' }))).toEqual({
      text: 'Хм.',
      attempts: [],
      prompt: null,
      signals: ['tease'],
    });
  });

  it('turn an error or a malformed body into null', async () => {
    const answers = [json({}, 502), json({ text: 5 })];
    let i = 0;
    const client = await remoteConversationClient({
      url: URL_BASE,
      anonKey: 'anon',
      fetch: fakeFetch(() => answers[i++] as Promise<Response>),
    });
    expect(await client.planLine(toPlanLinePayload(planInput))).toBeNull();
    expect(await client.planLine(toPlanLinePayload(planInput))).toBeNull();
    expect(await silentConversationClient.planLine(toPlanLinePayload(planInput))).toBeNull();
  });
});
