import type { TelegramCallbackQuery } from './types/telegram.types';

/**
 * After a button tap, rewrites the message in place: the buttons go away and the choice stays visible ("✅ …").
 * Best effort: the tap itself was already handled, so an edit that fails (message too old, edited twice) is ignored.
 */
export async function markChosen(
  api: { editMessageText?: (chatId: number, messageId: number, text: string) => Promise<unknown> },
  query: TelegramCallbackQuery,
  label: string,
): Promise<void> {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  if (!chatId || !messageId || typeof api.editMessageText !== 'function') return;
  try {
    await api.editMessageText(chatId, messageId, `${query.message?.text ?? ''}\n\n✅ ${label}`.trim());
  } catch {
    // The choice is already recorded.
  }
}
