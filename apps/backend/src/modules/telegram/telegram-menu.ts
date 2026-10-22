import { BOT_LANGS, botText, type BotMessageKey } from './telegram-i18n';

type Tr = (key: BotMessageKey, params?: Record<string, string | number>) => string;

/** The persistent menu under the chat input. */
export const mainMenuKeyboard = (tr: Tr) => ({
  keyboard: [
    [{ text: tr('menuFields') }, { text: tr('myAppsButton') }],
    [{ text: tr('menuLanguage') }, { text: tr('menuHelp') }],
  ],
  resize_keyboard: true,
});

export type MenuAction = 'fields' | 'applications' | 'language' | 'help';

const MENU_KEYS: Array<[MenuAction, BotMessageKey]> = [
  ['fields', 'menuFields'],
  ['applications', 'myAppsButton'],
  ['language', 'menuLanguage'],
  ['help', 'menuHelp'],
];

/** Which menu button a message is, in any language (a tap arrives as plain text). */
export function menuActionFor(text: string): MenuAction | null {
  for (const [action, key] of MENU_KEYS) if (BOT_LANGS.some((lang) => botText(lang, key) === text)) return action;
  return null;
}
