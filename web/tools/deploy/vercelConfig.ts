import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

interface Route {
  src?: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export interface OutputConfig {
  version: number;
  routes: Route[];
}

const CSP = 'Content-Security-Policy';

function originOf(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error(`the talk server must use https, got ${url}`);
  }
  return parsed.origin;
}

function withConnect(policy: string, origin: string): string {
  const parts = policy.split(';').map((part) => part.trim());
  const index = parts.findIndex((part) => part.startsWith('connect-src '));
  if (index === -1) {
    throw new Error('the policy has no connect-src');
  }
  parts[index] = `${parts[index]} ${origin}`;
  return parts.join('; ');
}

export function allowConnect(config: OutputConfig, url: string | undefined): OutputConfig {
  if (url === undefined || url === '') {
    return config;
  }
  const origin = originOf(url);
  const routes = config.routes.map((route) => {
    const policy = route.headers?.[CSP];
    if (policy === undefined) {
      return route;
    }
    return { ...route, headers: { ...route.headers, [CSP]: withConnect(policy, origin) } };
  });
  return { ...config, routes };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [source, target] = process.argv.slice(2);
  if (source === undefined || target === undefined) {
    throw new Error('usage: node tools/deploy/vercelConfig.ts <source> <target>');
  }
  const config = JSON.parse(readFileSync(source, 'utf8')) as OutputConfig;
  const next = allowConnect(config, process.env['VITE_SUPABASE_URL']);
  writeFileSync(target, `${JSON.stringify(next, null, 2)}\n`);
}
