import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { getConfig } from '../../config/app.config';

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };
type BotIdentity = { id: number; username: string; first_name: string };

@Injectable()
export class TelegramApiService {
  private readonly config = getConfig();
  private cachedBot: BotIdentity | null = null;

  private get baseUrl() {
    if (!this.config.TELEGRAM_BOT_TOKEN)
      throw new ServiceUnavailableException('Telegram bot is not configured');
    return `https://api.telegram.org/bot${this.config.TELEGRAM_BOT_TOKEN}`;
  }

  async getMe(): Promise<BotIdentity> {
    if (this.cachedBot) return this.cachedBot;
    if (!this.config.TELEGRAM_BOT_TOKEN) {
      throw new ServiceUnavailableException('Telegram bot is not configured');
    }
    try {
      const response = await fetch(`${this.baseUrl}/getMe`, {
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await response.json()) as TelegramResponse<{
        id: number;
        username: string;
        first_name: string;
      }>;
      if (response.ok && data.ok && data.result?.username) {
        this.cachedBot = data.result;
        return data.result;
      }
      throw new ServiceUnavailableException('Telegram bot identity could not be verified');
    } catch {
      throw new ServiceUnavailableException('Telegram bot identity could not be verified');
    }
  }

  async getFile(fileId: string) {
    const response = await fetch(`${this.baseUrl}/getFile?file_id=${encodeURIComponent(fileId)}`, {
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await response.json()) as TelegramResponse<{
      file_path?: string;
      file_size?: number;
    }>;
    if (!response.ok || !data.ok || !data.result?.file_path)
      throw new ServiceUnavailableException('Telegram file metadata request failed');
    return data.result;
  }

  async getChat(chatId: string) {
    const response = await fetch(`${this.baseUrl}/getChat?chat_id=${encodeURIComponent(chatId)}`, { signal: AbortSignal.timeout(10_000) });
    const data = await response.json() as TelegramResponse<{ id: number; title?: string; username?: string; type: string }>;
    if (!response.ok || !data.ok || !data.result) throw new ServiceUnavailableException('Telegram channel could not be found');
    return data.result;
  }

  async getChatMember(chatId: string, userId: number) {
    const response = await fetch(`${this.baseUrl}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${userId}`, { signal: AbortSignal.timeout(10_000) });
    const data = await response.json() as TelegramResponse<{ status: string; can_post_messages?: boolean }>;
    if (!response.ok || !data.ok || !data.result) throw new ServiceUnavailableException('Telegram channel permissions could not be verified');
    return data.result;
  }

  async downloadFile(filePath: string, maxBytes = 10 * 1024 * 1024) {
    const response = await fetch(
      `https://api.telegram.org/file/bot${this.config.TELEGRAM_BOT_TOKEN}/${filePath}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    const declared = Number(response.headers.get('content-length') || 0);
    if (!response.ok || declared > maxBytes)
      throw new ServiceUnavailableException('Telegram file download failed');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes)
      throw new ServiceUnavailableException('Telegram CV exceeds the 10 MB limit');
    return buffer;
  }

  async sendMessage(
    chatId: string | number,
    text: string,
    options?: { businessConnectionId?: string; parseMode?: string; replyMarkup?: any },
  ): Promise<TelegramResponse<any> & { uncertain?: boolean }> {
    if (!this.config.TELEGRAM_BOT_TOKEN) {
      return { ok: false, description: 'Telegram bot token is not configured' };
    }
    const payload: Record<string, any> = {
      chat_id: chatId,
      text,
    };
    if (options?.businessConnectionId) {
      payload.business_connection_id = options.businessConnectionId;
    }
    if (options?.parseMode) {
      payload.parse_mode = options.parseMode;
    }
    if (options?.replyMarkup) {
      payload.reply_markup = options.replyMarkup;
    }
    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await response.json()) as TelegramResponse<any>;
      return { ...data, uncertain: response.status >= 500 };
    } catch (err) {
      return { ok: false, description: (err as Error).message, uncertain: true };
    }
  }

  /** A map pin with a title and address (shown as a venue card in the chat). */
  async sendVenue(
    chatId: string | number,
    latitude: number,
    longitude: number,
    title: string,
    address: string,
    options?: { businessConnectionId?: string },
  ): Promise<TelegramResponse<any>> {
    if (!this.config.TELEGRAM_BOT_TOKEN) {
      return { ok: false, description: 'Telegram bot token is not configured' };
    }
    const payload: Record<string, any> = { chat_id: chatId, latitude, longitude, title: title.slice(0, 100), address: address.slice(0, 200) };
    if (options?.businessConnectionId) payload.business_connection_id = options.businessConnectionId;
    try {
      const response = await fetch(`${this.baseUrl}/sendVenue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      return (await response.json()) as TelegramResponse<any>;
    } catch (err) {
      return { ok: false, description: (err as Error).message };
    }
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
    if (!this.config.TELEGRAM_BOT_TOKEN) {
      return { ok: false, description: 'Telegram bot token is not configured' };
    }
    const payload: Record<string, any> = {
      callback_query_id: callbackQueryId,
      show_alert: showAlert,
    };
    if (text) payload.text = text;
    try {
      const response = await fetch(`${this.baseUrl}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      return (await response.json()) as TelegramResponse<any>;
    } catch (err) {
      return { ok: false, description: (err as Error).message };
    }
  }

  async editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    options?: { parseMode?: string; replyMarkup?: any },
  ) {
    if (!this.config.TELEGRAM_BOT_TOKEN) {
      return { ok: false, description: 'Telegram bot token is not configured' };
    }
    const payload: Record<string, any> = {
      chat_id: chatId,
      message_id: messageId,
      text,
    };
    if (options?.parseMode) payload.parse_mode = options.parseMode;
    if (options?.replyMarkup) payload.reply_markup = options.replyMarkup;
    try {
      const response = await fetch(`${this.baseUrl}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      return (await response.json()) as TelegramResponse<any>;
    } catch (err) {
      return { ok: false, description: (err as Error).message };
    }
  }

  /** Shows "typing…" for a few seconds while the bot works on a reply. Best effort: failures are ignored. */
  async sendChatAction(chatId: string | number, action: 'typing' | 'upload_document' = 'typing') {
    if (!this.config.TELEGRAM_BOT_TOKEN) return;
    try {
      await fetch(`${this.baseUrl}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      // The indicator is cosmetic.
    }
  }

  /** Sends a text file (for example an interview transcript) as a document. */
  async sendDocument(
    chatId: string | number,
    file: { name: string; content: string },
    options?: { caption?: string; parseMode?: string },
  ): Promise<TelegramResponse<any>> {
    if (!this.config.TELEGRAM_BOT_TOKEN) {
      return { ok: false, description: 'Telegram bot token is not configured' };
    }
    const form = new FormData();
    form.set('chat_id', String(chatId));
    form.set('document', new Blob([file.content], { type: 'text/plain; charset=utf-8' }), file.name);
    if (options?.caption) form.set('caption', options.caption.slice(0, 1000));
    if (options?.parseMode) form.set('parse_mode', options.parseMode);
    try {
      const response = await fetch(`${this.baseUrl}/sendDocument`, { method: 'POST', body: form, signal: AbortSignal.timeout(20_000) });
      return (await response.json()) as TelegramResponse<any>;
    } catch (err) {
      return { ok: false, description: (err as Error).message };
    }
  }
}
