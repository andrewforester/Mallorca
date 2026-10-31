import { describe, expect, it } from 'vitest';
import { allowConnect } from './vercelConfig.ts';

const CSP = "default-src 'self'; connect-src 'self'; worker-src 'self'";

function config(csp: string) {
  return {
    version: 3,
    routes: [
      {
        src: '/(.*)',
        headers: { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' },
      },
      { handle: 'filesystem' },
    ],
  };
}

describe('allowConnect', () => {
  it('adds the origin of the talk server to connect-src', () => {
    const next = allowConnect(config(CSP), 'https://abc.supabase.co/');
    expect(next.routes[0]?.headers?.['Content-Security-Policy']).toBe(
      "default-src 'self'; connect-src 'self' https://abc.supabase.co; worker-src 'self'",
    );
    expect(next.routes[0]?.headers?.['X-Content-Type-Options']).toBe('nosniff');
    expect(next.routes[1]).toEqual({ handle: 'filesystem' });
  });

  it('keeps only the origin of a url with a path', () => {
    const next = allowConnect(config(CSP), 'https://abc.supabase.co/functions/v1');
    expect(next.routes[0]?.headers?.['Content-Security-Policy']).toContain(
      "connect-src 'self' https://abc.supabase.co;",
    );
  });

  it('leaves the config as it is without a url', () => {
    expect(allowConnect(config(CSP), undefined)).toEqual(config(CSP));
    expect(allowConnect(config(CSP), '')).toEqual(config(CSP));
  });

  it('refuses a url that is not https', () => {
    expect(() => allowConnect(config(CSP), 'http://abc.supabase.co')).toThrow(/https/);
    expect(() => allowConnect(config(CSP), 'not a url')).toThrow();
  });

  it('refuses a policy without connect-src', () => {
    expect(() => allowConnect(config("default-src 'self'"), 'https://abc.supabase.co')).toThrow(
      /connect-src/,
    );
  });
});
