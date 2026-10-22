import { Api } from 'teleproto';
import { describe, expect, it, vi } from 'vitest';
import { floodSeconds, TelegramDiscoveryClient, TelegramFloodError } from './telegram-discovery.client';

function channel(fields: Record<string, unknown>) {
  return Object.assign(Object.create(Api.Channel.prototype), fields) as Api.Channel;
}

describe('Telegram public channel reader', () => {
  it('returns only public broadcast channels and ignores groups and private channels', async () => {
    const client = new TelegramDiscoveryClient();
    const invoke = vi.fn().mockResolvedValueOnce({ messages: [], chats: [] }).mockResolvedValueOnce({ chats: [
      channel({ id: 1, title: 'Jobs', username: 'jobsuz', broadcast: true }),
      channel({ id: 2, title: 'Group', username: 'groupx', broadcast: false }),
      channel({ id: 3, title: 'Private', broadcast: true }),
      Object.assign(Object.create(Api.Chat.prototype), { id: 4, title: 'Chat' }),
    ] });
    Object.assign(client, { config: { TELEGRAM_API_ID: 1, TELEGRAM_API_HASH: 'hash', TELEGRAM_USER_SESSION_FILE: '/secret' }, client: { invoke } });
    await expect(client.search('jobs')).resolves.toEqual([{ id: '1', title: 'Jobs', username: 'jobsuz' }]);
  });

  it('discovers channels with matching recent public posts and removes duplicates', async () => {
    const client = new TelegramDiscoveryClient();
    const matching = channel({ id: 11, title: 'Uzbek IT Jobs', username: 'uzitjobs', broadcast: true });
    const unrelated = channel({ id: 22, title: 'Unrelated', username: 'unrelated', broadcast: true });
    const message = Object.assign(Object.create(Api.Message.prototype), { peerId: Object.assign(Object.create(Api.PeerChannel.prototype), { channelId: 11 }) });
    const invoke = vi.fn().mockResolvedValueOnce({ messages: [message], chats: [matching, matching, unrelated] }).mockResolvedValueOnce({ chats: [matching] });
    Object.assign(client, { config: { TELEGRAM_API_ID: 1, TELEGRAM_API_HASH: 'hash', TELEGRAM_USER_SESSION_FILE: '/secret' }, client: { invoke } });

    await expect(client.search('backend developer')).resolves.toEqual([{ id: '11', title: 'Uzbek IT Jobs', username: 'uzitjobs' }]);
    expect(invoke.mock.calls[0][0]).toBeInstanceOf(Api.messages.SearchGlobal);
    expect(invoke.mock.calls[0][0]).toMatchObject({ broadcastsOnly: true, limit: 40 });
  });

  it('recognises flood waits however Telegram reports them', () => {
    expect(floodSeconds(Object.assign(new Error('x'), { name: 'FloodWaitError', seconds: 30 }))).toBe(30);
    expect(floodSeconds(new Error('A wait of 85 seconds is required (caused by contacts.Search)'))).toBe(85);
    expect(floodSeconds(new Error('FLOOD_WAIT_120'))).toBe(120);
    expect(floodSeconds(new Error('CHANNEL_PRIVATE'))).toBeNull();
  });

  it('sleeps through a short flood wait and retries, but surfaces a long one', async () => {
    vi.useFakeTimers();
    try {
      const client = new TelegramDiscoveryClient();
      const short = Object.assign(new Error('A wait of 2 seconds is required'), { name: 'FloodWaitError', seconds: 2 });
      const invoke = vi.fn().mockRejectedValueOnce(short).mockResolvedValueOnce({ messages: [], chats: [] }).mockResolvedValueOnce({ chats: [] });
      Object.assign(client, { config: { TELEGRAM_API_ID: 1, TELEGRAM_API_HASH: 'hash', TELEGRAM_USER_SESSION_FILE: '/secret' }, client: { invoke } });
      const search = client.search('jobs');
      await vi.advanceTimersByTimeAsync(3500);
      await expect(search).resolves.toEqual([]);
      expect(invoke).toHaveBeenCalledTimes(3);

      const long = Object.assign(new Error('A wait of 600 seconds is required'), { name: 'FloodWaitError', seconds: 600 });
      const blocked = new TelegramDiscoveryClient();
      Object.assign(blocked, { config: { TELEGRAM_API_ID: 1, TELEGRAM_API_HASH: 'hash', TELEGRAM_USER_SESSION_FILE: '/secret' }, client: { invoke: vi.fn().mockRejectedValue(long) } });
      await expect(blocked.search('jobs')).rejects.toBeInstanceOf(TelegramFloodError);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps at most ten text posts from the last 30 days', async () => {
    const client = new TelegramDiscoveryClient();
    const now = Math.floor(Date.now() / 1000);
    const entity = channel({ id: 11, title: 'Jobs', username: 'jobsuz', broadcast: true });
    const message = (date: number, value: string) => Object.assign(Object.create(Api.Message.prototype), { date, message: value });
    const getMessages = vi.fn().mockResolvedValue([
      ...Array.from({ length: 12 }, (_, index) => message(now - index * 3600, `Post ${index}`)),
      message(now - 31 * 86400, 'Old post'),
      message(now, ''),
    ]);
    Object.assign(client, {
      config: { TELEGRAM_API_ID: 1, TELEGRAM_API_HASH: 'hash', TELEGRAM_USER_SESSION_FILE: '/secret' },
      client: { getEntity: vi.fn().mockResolvedValue(entity), invoke: vi.fn().mockResolvedValue({ fullChat: Object.assign(Object.create(Api.ChannelFull.prototype), { about: 'Developer jobs', participantsCount: 400 }) }), getMessages },
    });
    const result = await client.inspect('jobsuz');
    expect(result?.posts).toHaveLength(10);
    expect(result?.posts).not.toContain('Old post');
    expect(result?.subscriberCount).toBe(400);
    expect(getMessages).toHaveBeenCalledWith(entity, { limit: 100 });
  });
});
