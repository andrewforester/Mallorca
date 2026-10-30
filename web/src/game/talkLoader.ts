import { silentTalkClient } from './talkClient.ts';
import type { TalkClient } from './talkClient.ts';

export interface TalkConfig {
  url?: string;
  anonKey?: string;
}

export async function loadTalkClient(config: TalkConfig): Promise<TalkClient> {
  const { url, anonKey } = config;
  if (url === undefined || url === '' || anonKey === undefined || anonKey === '') {
    return silentTalkClient;
  }
  try {
    const { remoteTalkClient } = await import('./remoteTalk.ts');
    return await remoteTalkClient({ url, anonKey });
  } catch {
    return silentTalkClient;
  }
}
