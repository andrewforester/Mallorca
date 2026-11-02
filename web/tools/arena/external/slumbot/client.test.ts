import { describe, expect, it } from 'vitest';
import { AbandonedHand, createSlumbotClient, SlumbotError } from './client.ts';

type Reply = { status: number; body: unknown } | Error;

function refused(): Error {
  return new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
}

function fakeFetch(replies: Reply[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = (async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
    const reply = replies.shift();
    if (reply === undefined) throw new Error('no reply left');
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const HAND = { action: 'b200', client_pos: 0, hole_cards: ['Ah', '7h'], board: [] };
const sleeps: number[] = [];
const sleep = async (ms: number) => {
  sleeps.push(ms);
};

describe('createSlumbotClient', () => {
  it('always sends the newest token and hides it from the state', async () => {
    const { fetch, calls } = fakeFetch([
      { status: 200, body: { ...HAND, token: 't1' } },
      { status: 200, body: { ...HAND, action: 'b200c/', token: 't2' } },
      { status: 200, body: { ...HAND, action: 'b200c/k', token: 't2' } },
    ]);
    const client = createSlumbotClient({ fetch, sleep });
    const first = await client.newHand();
    await client.act('c');
    await client.act('k');
    expect(calls.map((c) => c.body.token)).toEqual([undefined, 't1', 't2']);
    expect(calls.map((c) => c.url)).toEqual([
      'https://slumbot.com/slumbot/api/new_hand',
      'https://slumbot.com/slumbot/api/act',
      'https://slumbot.com/slumbot/api/act',
    ]);
    expect(calls[1]?.body.incr).toBe('c');
    expect('token' in first).toBe(false);
  });

  it('retries a refused connection with growing pauses', async () => {
    sleeps.length = 0;
    const { fetch, calls } = fakeFetch([refused(), refused(), { status: 200, body: HAND }]);
    const client = createSlumbotClient({ fetch, sleep });
    await client.newHand();
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('gives up after five retries', async () => {
    const { fetch, calls } = fakeFetch(Array.from({ length: 6 }, refused));
    const client = createSlumbotClient({ fetch, sleep });
    await expect(client.newHand()).rejects.toThrow('fetch failed');
    expect(calls).toHaveLength(6);
  });

  it('retries a new hand on a server error', async () => {
    const { fetch, calls } = fakeFetch([
      { status: 503, body: {} },
      { status: 200, body: HAND },
    ]);
    await createSlumbotClient({ fetch, sleep }).newHand();
    expect(calls).toHaveLength(2);
  });

  it('abandons the hand when an act meets a server error', async () => {
    const { fetch, calls } = fakeFetch([
      { status: 200, body: HAND },
      { status: 503, body: {} },
    ]);
    const client = createSlumbotClient({ fetch, sleep });
    await client.newHand();
    await expect(client.act('c')).rejects.toBeInstanceOf(AbandonedHand);
    expect(calls).toHaveLength(2);
  });

  it('never resends an act that timed out', async () => {
    const timeout = new DOMException('timed out', 'TimeoutError');
    const { fetch, calls } = fakeFetch([{ status: 200, body: HAND }, timeout]);
    const client = createSlumbotClient({ fetch, sleep });
    await client.newHand();
    await expect(client.act('c')).rejects.toBeInstanceOf(AbandonedHand);
    expect(calls).toHaveLength(2);
  });

  it('retries an act whose connection was refused', async () => {
    const { fetch, calls } = fakeFetch([
      { status: 200, body: HAND },
      refused(),
      { status: 200, body: HAND },
    ]);
    const client = createSlumbotClient({ fetch, sleep });
    await client.newHand();
    await client.act('c');
    expect(calls).toHaveLength(3);
  });

  it('stops on an error message without retrying', async () => {
    const { fetch, calls } = fakeFetch([{ status: 400, body: { error_msg: 'Illegal bet' } }]);
    const client = createSlumbotClient({ fetch, sleep });
    await expect(client.newHand()).rejects.toThrow(SlumbotError);
    expect(calls).toHaveLength(1);
  });

  it('logs in before the first hand when credentials are given', async () => {
    const { fetch, calls } = fakeFetch([
      { status: 200, body: { token: 'login-token' } },
      { status: 200, body: HAND },
      { status: 200, body: HAND },
    ]);
    const client = createSlumbotClient({
      fetch,
      sleep,
      credentials: { username: 'u', password: 'p' },
    });
    await client.newHand();
    await client.newHand();
    expect(calls.map((c) => c.url.split('/').at(-1))).toEqual(['login', 'new_hand', 'new_hand']);
    expect(calls[0]?.body).toEqual({ username: 'u', password: 'p' });
    expect(calls[1]?.body.token).toBe('login-token');
  });
});
