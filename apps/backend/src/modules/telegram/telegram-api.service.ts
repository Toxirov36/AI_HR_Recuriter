import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { getConfig } from '../../config/app.config';

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };

@Injectable()
export class TelegramApiService {
  private readonly config = getConfig();

  private get baseUrl() {
    if (!this.config.TELEGRAM_BOT_TOKEN)
      throw new ServiceUnavailableException('Telegram bot is not configured');
    return `https://api.telegram.org/bot${this.config.TELEGRAM_BOT_TOKEN}`;
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
}
