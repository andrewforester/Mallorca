export interface SlumbotState {
  action: string;
  client_pos: 0 | 1;
  hole_cards: [string, string];
  board: string[];
  bot_hole_cards?: [string, string];
  winnings?: number;
  baseline_winnings?: number;
}

export class AbandonedHand extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbandonedHand';
  }
}

export class SlumbotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlumbotError';
  }
}

export interface SlumbotClient {
  newHand(): Promise<SlumbotState>;
  act(incr: string): Promise<SlumbotState>;
}

export interface SlumbotClientOptions {
  fetch: typeof fetch;
  baseUrl?: string;
  credentials?: { username: string; password: string };
  sleep?: (ms: number) => Promise<void>;
}

const BASE_URL = 'https://slumbot.com/slumbot/api/';
const PAUSES = [1000, 2000, 4000, 8000, 16000];
const TIMEOUT_MS = 30000;
const NOT_SENT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

class ServerError extends Error {}

function neverSent(error: unknown): boolean {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  return typeof cause?.code === 'string' && NOT_SENT.has(cause.code);
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const realSleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

export function createSlumbotClient(options: SlumbotClientOptions): SlumbotClient {
  const baseUrl = options.baseUrl ?? BASE_URL;
  const sleep = options.sleep ?? realSleep;
  let token: string | undefined;
  let loggedIn = options.credentials === undefined;

  async function post(endpoint: string, body: object): Promise<Record<string, unknown>> {
    const response = await options.fetch(baseUrl + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await readBody(response);
    if (typeof data.error_msg === 'string') throw new SlumbotError(data.error_msg);
    if (response.status >= 500) throw new ServerError(`Slumbot answered ${response.status}`);
    if (!response.ok) throw new SlumbotError(`Slumbot answered ${response.status}`);
    if (typeof data.token === 'string') token = data.token;
    delete data.token;
    return data;
  }

  async function withRetries<T>(call: () => Promise<T>, retryAny: boolean): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await call();
      } catch (error) {
        const retryable = neverSent(error) || (retryAny && !(error instanceof SlumbotError));
        const pause = PAUSES[attempt];
        if (!retryable || pause === undefined) throw error;
        await sleep(pause);
      }
    }
  }

  async function login(): Promise<void> {
    if (loggedIn || options.credentials === undefined) return;
    const { username, password } = options.credentials;
    await withRetries(() => post('login', { username, password }), true);
    loggedIn = true;
  }

  return {
    async newHand() {
      await login();
      const data = await withRetries(() => post('new_hand', token ? { token } : {}), true);
      return data as unknown as SlumbotState;
    },
    async act(incr) {
      try {
        const data = await withRetries(() => post('act', { token, incr }), false);
        return data as unknown as SlumbotState;
      } catch (error) {
        if (error instanceof SlumbotError) throw error;
        throw new AbandonedHand(error instanceof Error ? error.message : String(error));
      }
    },
  };
}
