import { silentConversationClient } from './conversationClient.ts';
import type { ConversationClient } from './conversationClient.ts';

export interface ConversationConfig {
  url?: string;
  anonKey?: string;
}

const configured = (value: string | undefined): value is string =>
  value !== undefined && value !== '';

export async function loadConversationClient(
  config: ConversationConfig,
): Promise<ConversationClient> {
  const { url, anonKey } = config;
  if (!configured(url) || !configured(anonKey)) {
    return silentConversationClient;
  }
  try {
    const { remoteConversationClient } = await import('./remoteConversation.ts');
    return await remoteConversationClient({ url, anonKey });
  } catch {
    return silentConversationClient;
  }
}

export function conversationConnector(
  config: ConversationConfig,
): (() => Promise<ConversationClient>) | undefined {
  if (!configured(config.url) || !configured(config.anonKey)) {
    return undefined;
  }
  let client: Promise<ConversationClient> | null = null;
  return () => (client ??= loadConversationClient(config));
}
