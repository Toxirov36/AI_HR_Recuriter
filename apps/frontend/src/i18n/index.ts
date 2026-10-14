import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import { defaultLocale, locales, type Locale } from './config';
import { detectInitialLocale, saveLocale } from './utils';

import uz from './locales/uz.json';
import ru from './locales/ru.json';
import en from './locales/en.json';
import tg from './locales/tg.json';

export const resources = {
  uz: { translation: uz },
  ru: { translation: ru },
  en: { translation: en },
  tg: { translation: tg },
} as const;

const initialLocale = detectInitialLocale();

if (!i18n.isInitialized) {
  void i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: initialLocale,
      fallbackLng: defaultLocale,
      supportedLngs: locales as readonly string[],
      interpolation: {
        escapeValue: false, // React already escapes XSS
      },
      returnNull: false,
      returnEmptyString: false,
      react: {
        useSuspense: false,
      },
    });

  if (typeof document !== 'undefined') {
    document.documentElement.lang = initialLocale;
    document.documentElement.dir = 'ltr';
  }
}

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng;
    document.documentElement.dir = 'ltr';
  }
});

/**
 * Changes active locale seamlessly across session and updates persistence.
 */
export async function changeLanguage(locale: Locale, userId?: number | string): Promise<void> {
  saveLocale(locale, userId);
  await i18n.changeLanguage(locale);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

export { i18n, useTranslation };
export default i18n;
export * from './config';
export * from './utils';
