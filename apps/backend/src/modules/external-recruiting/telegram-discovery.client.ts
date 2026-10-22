import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { Api, TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import { getConfig, telegramSessionPath } from '../../config/app.config';

export type DiscoveredChannel = {
  telegramId: string;
  title: string;
  username: string;
  description: string;
  subscriberCount: number | null;
  posts: string[];
  checkedAt: string;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Telegram throttles user accounts hard: pace requests and wait out short flood waits.
const MIN_GAP_MS = 1000;
const MAX_FLOOD_SLEEP_SECONDS = 45;
const MAX_FLOOD_RETRIES = 2;

/** Seconds Telegram asked us to wait, or null when the error is not a flood wait. */
export function floodSeconds(error: unknown): number | null {
  const candidate = error as { name?: string; seconds?: unknown; message?: string } | null;
  const message = candidate?.message ?? '';
  if (typeof candidate?.seconds === 'number' && (candidate.name === 'FloodWaitError' || /flood/i.test(message))) return candidate.seconds;
  const parsed = /FLOOD_WAIT_(\d+)|wait of (\d+) seconds/i.exec(message);
  if (parsed) return Number(parsed[1] ?? parsed[2]);
  return candidate?.name === 'FloodWaitError' ? 60 : null;
}

export class TelegramFloodError extends Error {
  constructor(readonly seconds: number) {
    super(`FLOOD_WAIT_${seconds}`);
    this.name = 'FloodWaitError';
  }
}

@Injectable()
export class TelegramDiscoveryClient implements OnModuleDestroy {
  private readonly config = getConfig();
  private client?: TelegramClient<StringSession>;
  private connecting?: Promise<TelegramClient<StringSession>>;
  private nextRequestAt = 0;

  get configured() {
    return Boolean(this.config.TELEGRAM_API_ID && this.config.TELEGRAM_API_HASH && this.config.TELEGRAM_USER_SESSION_FILE);
  }

  private async ready() {
    if (!this.configured) throw new ServiceUnavailableException('Telegram discovery account is not configured');
    if (this.client) return this.client;
    if (!this.connecting) this.connecting = this.connect().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }

  private async pace() {
    const gap = process.env.NODE_ENV === 'test' ? 0 : MIN_GAP_MS;
    const at = Math.max(Date.now(), this.nextRequestAt);
    this.nextRequestAt = at + gap;
    if (at > Date.now()) await sleep(at - Date.now());
  }

  /** One paced Telegram request; short flood waits are slept through and retried, long ones surface as TelegramFloodError. */
  private async call<T>(request: (client: TelegramClient<StringSession>) => Promise<T>): Promise<T> {
    const client = await this.ready();
    for (let attempt = 0; ; attempt += 1) {
      await this.pace();
      try {
        return await request(client);
      } catch (error) {
        const seconds = floodSeconds(error);
        if (seconds === null) throw error;
        if (seconds > MAX_FLOOD_SLEEP_SECONDS || attempt >= MAX_FLOOD_RETRIES) throw new TelegramFloodError(seconds);
        await sleep((seconds + 1) * 1000);
      }
    }
  }

  private async connect() {
    let session: string;
    try {
      session = (await readFile(telegramSessionPath(this.config.TELEGRAM_USER_SESSION_FILE), 'utf8')).trim();
      if (!session) throw new Error('empty session');
    } catch {
      throw new ServiceUnavailableException('Telegram discovery session file is unavailable');
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const client = new TelegramClient(new StringSession(session), this.config.TELEGRAM_API_ID, this.config.TELEGRAM_API_HASH, {
        connectionRetries: 2,
        requestRetries: 1,
        floodSleepThreshold: 0,
      });
      try {
        await client.connect();
        const account = await client.getMe();
        if (!account || account.bot) {
          throw new Error('Telegram user session is expired or invalid');
        }
        this.client = client;
        return client;
      } catch (error) {
        await client.disconnect().catch(() => undefined);
        const message = error instanceof Error ? error.message : String(error);
        if (/AUTH_KEY_UNREGISTERED|AUTH_KEY_INVALID|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED|PHONE_NUMBER_BANNED|session is expired or invalid/i.test(message)) {
          throw new ServiceUnavailableException('Telegram discovery account is disconnected; reconnect its session');
        }
        if (attempt < 2) await sleep(500 * (attempt + 1));
      }
    }
    throw new ServiceUnavailableException('Telegram discovery is temporarily unavailable; try again shortly');
  }

  async search(query: string): Promise<Array<{ id: string; title: string; username: string }>> {
    const result = await this.call(client => client.invoke(new Api.messages.SearchGlobal({
      q: query,
      filter: new Api.InputMessagesFilterEmpty(),
      minDate: Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000),
      maxDate: 0,
      offsetRate: 0,
      offsetPeer: new Api.InputPeerEmpty(),
      offsetId: 0,
      limit: 40,
      broadcastsOnly: true,
    })));
    const channels = new Map<string, { id: string; title: string; username: string }>();
    const add = (chat: Api.TypeChat) => {
      if (!(chat instanceof Api.Channel) || chat.broadcast !== true || !/^[a-zA-Z0-9_]{5,32}$/.test(chat.username ?? '')) return;
      const id = String(chat.id);
      if (!channels.has(id)) channels.set(id, { id, title: chat.title, username: chat.username! });
    };
    if ('messages' in result && 'chats' in result) {
      const matchingIds = new Set(result.messages
        .filter((message): message is Api.Message => message instanceof Api.Message && message.peerId instanceof Api.PeerChannel)
        .map(message => String((message.peerId as Api.PeerChannel).channelId)));
      for (const chat of result.chats) {
        if (matchingIds.has(String(chat.id))) add(chat);
      }
    }
    if (channels.size < 4) {
      const byName = await this.call(client => client.invoke(new Api.contacts.Search({ q: query, limit: 12 })));
      for (const chat of byName.chats) add(chat);
    }
    return [...channels.values()];
  }

  async inspect(username: string): Promise<DiscoveredChannel | null> {
    const entity = await this.call(client => client.getEntity(username));
    if (!(entity instanceof Api.Channel) || entity.broadcast !== true || !/^[a-zA-Z0-9_]{5,32}$/.test(entity.username ?? '')) return null;
    const full = await this.call(client => client.invoke(new Api.channels.GetFullChannel({ channel: entity })));
    if (!(full.fullChat instanceof Api.ChannelFull)) return null;
    const cutoff = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const messages = await this.call(client => client.getMessages(entity, { limit: 100 }));
    const posts = messages
      .filter(message => message instanceof Api.Message && typeof message.message === 'string' && message.message.trim() && Number(message.date) >= cutoff)
      .slice(0, 10)
      .map(message => message.message.trim().slice(0, 500));
    return {
      telegramId: String(entity.id),
      title: entity.title,
      username: entity.username!,
      description: full.fullChat.about.slice(0, 1200),
      subscriberCount: full.fullChat.participantsCount ?? entity.participantsCount ?? null,
      posts,
      checkedAt: new Date().toISOString(),
    };
  }

  async onModuleDestroy() {
    await this.client?.disconnect().catch(() => undefined);
  }
}
