import { silentTalkClient } from './talkClient.ts';
import type { TalkClient } from './talkClient.ts';

export interface TalkConfig {
  url?: string;
  anonKey?: string;
}

const configured = (value: string | undefined): value is string =>
  value !== undefined && value !== '';

export async function loadTalkClient(config: TalkConfig): Promise<TalkClient> {
  const { url, anonKey } = config;
  if (!configured(url) || !configured(anonKey)) {
    return silentTalkClient;
  }
  try {
    const { remoteTalkClient } = await import('./remoteTalk.ts');
    return await remoteTalkClient({ url, anonKey });
  } catch {
    return silentTalkClient;
  }
}

export function talkConnector(config: TalkConfig): (() => Promise<TalkClient>) | undefined {
  if (!configured(config.url) || !configured(config.anonKey)) {
    return undefined;
  }
  let client: Promise<TalkClient> | null = null;
  return () => (client ??= loadTalkClient(config));
}
