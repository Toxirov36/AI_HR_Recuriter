import { Injectable, Logger } from '@nestjs/common';
import type { TelegramCallbackQuery } from './types/telegram.types';

export type TelegramCallbackHandler = (query: TelegramCallbackQuery) => Promise<void>;

/**
 * Lets other modules answer inline-button callbacks without the Telegram module depending on them
 * (applications and interviews already depend on Telegram, so the other direction would be a cycle).
 * A handler registers a callback-data prefix, for example "iv:" or "action:reject".
 */
@Injectable()
export class TelegramCallbackRegistry {
  private readonly logger = new Logger(TelegramCallbackRegistry.name);
  private readonly handlers = new Map<string, TelegramCallbackHandler>();

  register(prefix: string, handler: TelegramCallbackHandler) {
    this.handlers.set(prefix, handler);
  }

  /** Runs the handler whose prefix matches; returns false when nothing is registered for this data. */
  async dispatch(query: TelegramCallbackQuery): Promise<boolean> {
    const data = query.data ?? '';
    for (const [prefix, handler] of this.handlers) {
      if (!data.startsWith(prefix)) continue;
      try {
        await handler(query);
      } catch (error) {
        this.logger.warn(`Callback ${prefix} failed: ${(error as Error).message}`);
      }
      return true;
    }
    return false;
  }
}
