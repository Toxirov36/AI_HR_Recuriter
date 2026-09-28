import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { getConfig } from '../../config/app.config';

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };

@Injectable()
export class TelegramApiService {
  private readonly config = getConfig();
  private cachedBotUsername: string | null = null;

  private get baseUrl() {
    if (!this.config.TELEGRAM_BOT_TOKEN)
      throw new ServiceUnavailableException('Telegram bot is not configured');
    return `https://api.telegram.org/bot${this.config.TELEGRAM_BOT_TOKEN}`;
  }

  async getMe(): Promise<{ id: number; username: string; first_name: string }> {
    if (this.cachedBotUsername) {
      return { id: 0, username: this.cachedBotUsername, first_name: 'Recruiter Bot' };
    }
    if (!this.config.TELEGRAM_BOT_TOKEN) {
      return { id: 0, username: 'recruiter_bot', first_name: 'Recruiter Bot' };
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
      if (data.ok && data.result?.username) {
        this.cachedBotUsername = data.result.username;
        return data.result;
      }
      return { id: 0, username: 'recruiter_bot', first_name: 'Recruiter Bot' };
    } catch {
      return { id: 0, username: 'recruiter_bot', first_name: 'Recruiter Bot' };
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
  ) {
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
      return data;
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
}
