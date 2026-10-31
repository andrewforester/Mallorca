import { describe, expect, it, vi } from 'vitest';
import { silentTalkClient } from './talkClient.ts';
import type { TalkClient } from './talkClient.ts';
import { loadTalkClient, talkConnector } from './talkLoader.ts';

const remote: TalkClient = { ...silentTalkClient, enabled: true };
const remoteTalkClient = vi.hoisted(() => vi.fn());

vi.mock('./remoteTalk.ts', () => ({ remoteTalkClient }));

describe('loadTalkClient', () => {
  it('is silent without the Supabase config', async () => {
    expect(await loadTalkClient({})).toBe(silentTalkClient);
    expect(await loadTalkClient({ url: 'https://x.supabase.co', anonKey: '' })).toBe(
      silentTalkClient,
    );
    expect(await loadTalkClient({ url: '', anonKey: 'anon' })).toBe(silentTalkClient);
    expect(remoteTalkClient).not.toHaveBeenCalled();
  });

  it('loads the remote client when both values are set', async () => {
    remoteTalkClient.mockResolvedValueOnce(remote);
    const client = await loadTalkClient({ url: 'https://x.supabase.co', anonKey: 'anon' });
    expect(client).toBe(remote);
    expect(remoteTalkClient).toHaveBeenCalledWith({
      url: 'https://x.supabase.co',
      anonKey: 'anon',
    });
  });

  it('is silent when loading fails', async () => {
    remoteTalkClient.mockRejectedValueOnce(new Error('offline'));
    expect(await loadTalkClient({ url: 'https://x.supabase.co', anonKey: 'anon' })).toBe(
      silentTalkClient,
    );
  });

  it('has no connector without the Supabase config', () => {
    expect(talkConnector({})).toBeUndefined();
    expect(talkConnector({ url: 'https://x.supabase.co', anonKey: '' })).toBeUndefined();
  });

  it('connects lazily and only once', async () => {
    remoteTalkClient.mockClear();
    remoteTalkClient.mockResolvedValue(remote);
    const connect = talkConnector({ url: 'https://x.supabase.co', anonKey: 'anon' });
    expect(remoteTalkClient).not.toHaveBeenCalled();
    expect(await connect?.()).toBe(remote);
    expect(await connect?.()).toBe(remote);
    expect(remoteTalkClient).toHaveBeenCalledTimes(1);
  });
});
