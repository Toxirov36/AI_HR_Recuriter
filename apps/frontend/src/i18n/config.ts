export type Locale = 'uz' | 'ru' | 'en';

export const locales = ['uz', 'ru', 'en'] as const;
export const defaultLocale: Locale = 'uz';

export const SHORTLIST_LOCALE_KEY = 'shortlist_locale';

export interface LanguageOption {
  code: Locale;
  name: string;
  nativeName: string;
  flag: string;
}

export const languages: Record<Locale, LanguageOption> = {
  uz: {
    code: 'uz',
    name: 'Uzbek',
    nativeName: 'O‘zbekcha',
    flag: '🇺🇿',
  },
  ru: {
    code: 'ru',
    name: 'Russian',
    nativeName: 'Русский',
    flag: '🇷🇺',
  },
  en: {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '🇺🇸',
  },
};
