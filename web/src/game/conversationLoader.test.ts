import { describe, expect, it, vi } from 'vitest';
import { silentConversationClient } from './conversationClient.ts';
import type { ConversationClient } from './conversationClient.ts';
import { loadConversationClient, conversationConnector } from './conversationLoader.ts';

const remote: ConversationClient = { ...silentConversationClient, enabled: true };
const remoteConversationClient = vi.hoisted(() => vi.fn());

vi.mock('./remoteConversation.ts', () => ({ remoteConversationClient }));

describe('loadConversationClient', () => {
  it('is silent without the Supabase config', async () => {
    expect(await loadConversationClient({})).toBe(silentConversationClient);
    expect(await loadConversationClient({ url: 'https://x.supabase.co', anonKey: '' })).toBe(
      silentConversationClient,
    );
    expect(await loadConversationClient({ url: '', anonKey: 'anon' })).toBe(
      silentConversationClient,
    );
    expect(remoteConversationClient).not.toHaveBeenCalled();
  });

  it('loads the remote client when both values are set', async () => {
    remoteConversationClient.mockResolvedValueOnce(remote);
    const client = await loadConversationClient({ url: 'https://x.supabase.co', anonKey: 'anon' });
    expect(client).toBe(remote);
    expect(remoteConversationClient).toHaveBeenCalledWith({
      url: 'https://x.supabase.co',
      anonKey: 'anon',
    });
  });

  it('is silent when loading fails', async () => {
    remoteConversationClient.mockRejectedValueOnce(new Error('offline'));
    expect(await loadConversationClient({ url: 'https://x.supabase.co', anonKey: 'anon' })).toBe(
      silentConversationClient,
    );
  });

  it('has no connector without the Supabase config', () => {
    expect(conversationConnector({})).toBeUndefined();
    expect(conversationConnector({ url: 'https://x.supabase.co', anonKey: '' })).toBeUndefined();
  });

  it('connects lazily and only once', async () => {
    remoteConversationClient.mockClear();
    remoteConversationClient.mockResolvedValue(remote);
    const connect = conversationConnector({ url: 'https://x.supabase.co', anonKey: 'anon' });
    expect(remoteConversationClient).not.toHaveBeenCalled();
    expect(await connect?.()).toBe(remote);
    expect(await connect?.()).toBe(remote);
    expect(remoteConversationClient).toHaveBeenCalledTimes(1);
  });
});
