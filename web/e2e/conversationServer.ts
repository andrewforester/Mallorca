import type { BrowserContext, Page, Route } from '@playwright/test';

export const CONVERSATION_URL = 'http://talk.test';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

export interface ConversationRequest {
  kind: 'line' | 'reply' | 'summary';
  text?: string;
  intent?: { situation: string };
}

export type ConversationAnswer = (request: ConversationRequest) => {
  status: number;
  body: unknown;
};

function json(route: Route, status: number, body: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: CORS });
  }
  return route.fulfill({
    status,
    headers: CORS,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function anonymousSession(): unknown {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'e2e-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'e2e-refresh-token',
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      aud: 'authenticated',
      role: 'authenticated',
      is_anonymous: true,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(now * 1000).toISOString(),
    },
  };
}

type Target = Page | BrowserContext;

export async function refuseConversation(target: Target): Promise<void> {
  await target.route(`${CONVERSATION_URL}/**`, (route) => json(route, 200, {}));
}

export async function serveConversation(
  target: Target,
  answer: ConversationAnswer,
): Promise<ConversationRequest[]> {
  const requests: ConversationRequest[] = [];
  await target.route(`${CONVERSATION_URL}/auth/v1/**`, (route) =>
    json(route, 200, anonymousSession()),
  );
  await target.route(`${CONVERSATION_URL}/functions/v1/talk`, (route) => {
    if (route.request().method() === 'OPTIONS') {
      return json(route, 204, null);
    }
    const request = route.request().postDataJSON() as ConversationRequest;
    requests.push(request);
    const { status, body } = answer(request);
    return json(route, status, body);
  });
  return requests;
}
